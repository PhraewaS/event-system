"""PR96 regression cases. Offline doubles; no Google credentials or requests."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from live_release_client import GoogleLiveReleaseClient
from live_release_gate import evaluate_live_release
from test_live_release_gate import inputs, NOW


class StopMonitoring(BaseException):
    """Test-only stop at a verified still-blocked monitoring boundary."""


class Review96(unittest.TestCase):
    def test_R9601_lock_loss_during_token_fetch_is_checked_before_transport(self):
        b,t,c=inputs();real=GoogleLiveReleaseClient();real.bind_target(b['request'])
        real.freeze_cursor=Mock();real.freeze_cursor.fetchone.return_value=(6,)
        def token():
            real.freeze_cursor.fetchone.return_value=(0,)
            return 'synthetic-token'
        real.token=token;real.opener.open=Mock()
        c.assert_write_barrier=real.assert_write_barrier
        def activate(target,observation,*,authorize_now):
            body={'name':target['service'],'etag':'etag','template':{'revision':'','containers':[]},
                  'traffic':[{'type':'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST','percent':100}]}
            return real.request('https://run.googleapis.com/v2/'+target['service']+'?updateMask=template.containers%2Ctemplate.revision%2Ctraffic',
                                body=body,method='PATCH',pre_send=authorize_now)
        c.activate=activate
        with self.assertRaisesRegex(ValueError,'barrier lost'):
            evaluate_live_release(b,t,c,execute=True,clock=lambda:NOW)
        real.opener.open.assert_not_called()
        self.assertFalse(real.mutation_may_have_started)

    def test_R9601_lost_barrier_prevents_patch(self):
        b,t,c=inputs()
        c.assert_write_barrier=Mock(side_effect=ValueError('Database barrier lost'))
        with self.assertRaisesRegex(ValueError, 'barrier lost'):
            evaluate_live_release(b,t,c,execute=True,clock=lambda:NOW)
        self.assertNotIn('activate',c.calls)
        self.assertFalse(c.mutation_may_have_started)

    def test_R9602_lost_barrier_after_postcheck_cannot_report_success(self):
        b,t,c=inputs()
        c.assert_write_barrier=Mock(side_effect=[None,ValueError('Database barrier lost')])
        with self.assertRaisesRegex(ValueError,'barrier lost'):
            evaluate_live_release(b,t,c,execute=True,clock=lambda:NOW)
        self.assertEqual(c.calls.count('activate'),1)
        self.assertLess(c.calls.index('wait-disabled-confirmed'),c.calls.index('freeze-exit'))

    def recovery(self):
        b,_,_=inputs();t=b['request'];c=GoogleLiveReleaseClient();c.bind_target(t)
        template={'containers':[{'image':'approved','env':[{'name':'REGISTRATION_LIFECYCLE_WRITES_ENABLED','value':'false'}]}],
                  'serviceAccount':t['runtime_service_account'],'volumes':[]}
        c.baseline_service={'uid':'uid','template':copy.deepcopy(template)}
        c.freeze_cursor=Mock();c.freeze_cursor.fetchone.return_value=(6,)
        c.mutation_may_have_started=True
        false={'uid':'uid','template':template,'latestReadyRevision':'disabled','latestCreatedRevision':'disabled',
               'generation':'3','observedGeneration':'3','terminalCondition':{'state':'CONDITION_SUCCEEDED'},
               'trafficStatuses':[{'revision':'disabled','percent':100}]}
        serving={**copy.deepcopy(template),'conditions':[{'type':'Ready','state':'CONDITION_SUCCEEDED'}]}
        op=t['service'].split('/services/')[0]+'/operations/attempt-96'
        return t,c,false,serving,op

    def test_R9603_pending_operation_cannot_accept_old_disabled_revision(self):
        t,c,false,serving,op=self.recovery();c.activation_operation=op
        def request(url,**kwargs):
            if '/operations/' in url:return {'name':op,'done':False}
            if '/revisions/' in url:return serving
            return false
        c.request=Mock(side_effect=request)
        with patch('live_release_client.time.sleep',side_effect=StopMonitoring):
            with self.assertRaises(StopMonitoring):c.wait_until_disabled(t)
        self.assertTrue(any('/operations/' in call.args[0] for call in c.request.call_args_list))
        self.assertTrue(all(call.kwargs.get('method','GET')=='GET' for call in c.request.call_args_list))

    def test_R9604_missing_receipt_cannot_accept_old_disabled_revision(self):
        t,c,false,serving,_=self.recovery()
        c.request=Mock(side_effect=lambda url,**kwargs:serving if '/revisions/' in url else false)
        with patch('live_release_client.time.sleep',side_effect=StopMonitoring):
            with self.assertRaises(StopMonitoring):c.wait_until_disabled(t)
        c.request.assert_not_called()

    def test_R9605_terminal_exact_operation_then_disabled_state_allows_recovery(self):
        t,c,false,serving,op=self.recovery();c.activation_operation=op
        c.request=Mock(side_effect=[{'name':op,'done':True,'error':{'code':10}},false,serving])
        c.wait_until_disabled(t)
        self.assertEqual(c.request.call_args_list[0].args[0],'https://run.googleapis.com/v2/'+op)
        self.assertEqual(c.request.call_count,3)

    def test_R9603_delayed_operation_must_settle_before_disabled_reads(self):
        t,c,false,serving,op=self.recovery();c.activation_operation=op
        c.request=Mock(side_effect=[{'name':op,'done':False}, {'name':op,'done':True,'response':{'name':t['service']}},false,serving])
        with patch('live_release_client.time.sleep') as sleep:c.wait_until_disabled(t)
        self.assertEqual(sleep.call_count,1)
        self.assertTrue(all('/operations/' in call.args[0] for call in c.request.call_args_list[:2]))
        self.assertEqual(c.request.call_count,4)

    def test_R9604_unreadable_malformed_or_other_operation_cannot_resolve(self):
        for reply in (ValueError('read unavailable'), {'done':True}, {'name':'wrong','done':True,'error':{'code':10}},
                      {'name':None,'done':False}, 'missing-result', 'wrong-target'):
            with self.subTest(reply=reply):
                t,c,_,_,op=self.recovery();c.activation_operation=op
                if reply=='missing-result':reply={'name':op,'done':True}
                if reply=='wrong-target':reply={'name':op,'done':True,'response':{'name':'other'}}
                c.request=Mock(side_effect=reply) if isinstance(reply,Exception) else Mock(return_value=reply)
                with patch('live_release_client.time.sleep',side_effect=StopMonitoring):
                    with self.assertRaises(StopMonitoring):c.wait_until_disabled(t)
                self.assertFalse(c.activation_operation_settled)
                self.assertEqual(c.request.call_count,1)

    def test_R9603_operation_receipt_survives_poll_failure_and_cannot_be_reused(self):
        b,_,_=inputs();t=b['request'];c=GoogleLiveReleaseClient();op=t['service'].split('/services/')[0]+'/operations/attempt-96'
        old={'etag':'etag','uid':'uid','template':{'containers':[{'env':[{'name':'REGISTRATION_LIFECYCLE_WRITES_ENABLED','value':'false'}]}]}}
        c.request=Mock(side_effect=[old,{'name':op,'done':False},ValueError('poll unavailable')])
        with patch('live_release_client.time.sleep'):
            with self.assertRaisesRegex(ValueError,'poll unavailable'):
                c.activate(t,{'observed':{'serviceEtag':'etag','serviceUid':'uid'}},authorize_now=lambda:None)
        self.assertEqual(c.activation_operation,op)
        self.assertFalse(c.activation_operation_settled)
        self.assertEqual(c.request.call_args_list[-1].args[0],'https://run.googleapis.com/v2/'+op)
        c.request.reset_mock()
        with self.assertRaisesRegex(ValueError,'One activation attempt'):
            c.activate(t,{},authorize_now=lambda:None)
        c.request.assert_not_called()


if __name__=='__main__':unittest.main(verbosity=2)
