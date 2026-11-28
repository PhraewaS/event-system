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


if __name__=='__main__':unittest.main(verbosity=2)
