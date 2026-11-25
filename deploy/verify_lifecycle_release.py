"""Validate approved immutable state-aware image for manual reuse/activation."""
import json,os,re,sys
def verify():
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
  if os.environ.get('LIFECYCLE_CUTOVER_CONFIRMED')!='true' or not re.fullmatch(proof,os.environ.get('LIFECYCLE_CUTOVER_EVIDENCE','')):
   raise ValueError('Activation requires confirmed old-traffic drain and recorded cutover evidence.')
  if os.environ.get('LIFECYCLE_DB_FENCE_CONFIRMED')!='true' or not re.fullmatch(proof,os.environ.get('LIFECYCLE_DB_FENCE_EVIDENCE','')):
   raise ValueError('Activation requires retired database logins/sessions and recorded database-fence evidence; timeout alone is insufficient.')
if __name__=='__main__':
 try:verify()
 except (ValueError,KeyError,TypeError) as e:print('Lifecycle release blocked: '+str(e),file=sys.stderr);sys.exit(1)
