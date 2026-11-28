"""Validate approved immutable state-aware image for manual reuse/activation."""
import json,os,re,sys
from verify_credential_fence import METHOD
def verify():
 if (os.environ.get('LIFECYCLE_DB_FENCE_METHOD')==METHOD or
     any(os.environ.get(k) for k in ('CP_FENCE_BUNDLE_PATH','CP_APPROVED_PROOF_SHA256','CP_ACCEPTED_IMPLEMENTATION_SHA','CP_APPROVED_REVIEWER')) or
     os.environ.get('CP_ACTIVATION_APPROVED')=='true'):
  raise ValueError('CP-v1 is offline-only until independent live configuration verification is implemented; release is blocked.')
 if os.environ.get('ROLLBACK','false')!='true':
  if os.environ.get('ACTIVATE_LIFECYCLE','false')!='false':raise ValueError('Activation requires explicit manual image reuse.')
  return
 sha=os.environ['IMAGE_TAG'];digest=os.environ['EXPECTED_IMAGE_DIGEST']
 approved=json.loads(os.environ.get('LIFECYCLE_APPROVED_IMAGES_JSON','[]'))
 if not isinstance(approved,list):raise ValueError('Approval must be a list.')
 proof=r'https://github\.com/PhraewaS/event-system/(?:actions/runs/\d+|issues/\d+#issuecomment-\d+)'
 if not any(isinstance(a,dict) and a.get('sha')==sha and a.get('digest')==digest and a.get('compatibility')=='ACTIVE_V1' and re.fullmatch(proof,a.get('evidence','')) for a in approved):
  raise ValueError('No approved ACTIVE_V1 compatibility evidence for this SHA/digest.')
 if os.environ.get('ACTIVATE_LIFECYCLE','false')=='true':
  method=os.environ.get('LIFECYCLE_DB_FENCE_METHOD','POSTGRES_ROLE_NOLOGIN_AND_TERMINATE')
  if method not in ('POSTGRES_ROLE_NOLOGIN_AND_TERMINATE',METHOD):raise ValueError('Unknown database fence method.')
  if os.environ.get('LIFECYCLE_CUTOVER_CONFIRMED')!='true' or not re.fullmatch(proof,os.environ.get('LIFECYCLE_CUTOVER_EVIDENCE','')):
   raise ValueError('Activation requires confirmed old-traffic drain and recorded cutover evidence.')
  if os.environ.get('LIFECYCLE_DB_FENCE_CONFIRMED')!='true' or not re.fullmatch(proof,os.environ.get('LIFECYCLE_DB_FENCE_EVIDENCE','')):
   raise ValueError('Activation requires retired database logins/sessions and recorded database-fence evidence; timeout alone is insufficient.')
if __name__=='__main__':
 try:verify()
 except (ValueError,KeyError,TypeError,OSError):print('Lifecycle release blocked: approval/evidence validation failed.',file=sys.stderr);sys.exit(1)
