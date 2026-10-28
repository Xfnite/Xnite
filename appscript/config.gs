const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';

function getPostgrestToken_() {
  return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
}
