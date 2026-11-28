// Fail-closed interface while the read-only collector is not implemented.
export async function collectCloudConfiguration() {
  return {cloudFieldsMatch:false,reasons:['READER_NOT_IMPLEMENTED'],releaseActivationAllowed:false};
}
