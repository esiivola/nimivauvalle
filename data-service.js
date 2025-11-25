const DEFAULT_PATHS = {
  firstNames: 'data/first-names.json',
  lastNames: 'data/last-names.json',
  schema: 'data/schema.json'
};

function assertResponseOk(response, label) {
  if (!response || !response.ok) {
    throw new Error(`Failed to load ${label}`);
  }
}

export async function loadDataset(options = {}) {
  const { includeSurnames = false, paths = DEFAULT_PATHS } = options;
  const requests = [fetch(paths.firstNames)];
  const labels = ['first names'];
  if (includeSurnames) {
    requests.push(fetch(paths.lastNames));
    labels.push('last names');
  }
  requests.push(fetch(paths.schema));
  labels.push('schema');

  const responses = await Promise.all(requests);
  responses.forEach((response, idx) => {
    const label = labels[idx] || 'data';
    assertResponseOk(response, label);
  });

  const payloads = await Promise.all(responses.map((response) => response.json()));
  const namesPayload = payloads[0] || {};
  const schemaPayload = payloads[payloads.length - 1] || {};
  const surnamesPayload = includeSurnames && payloads.length > 2 ? payloads[1] : {};

  return {
    names: namesPayload.names || [],
    surnames: includeSurnames ? surnamesPayload.names || [] : [],
    schema: schemaPayload
  };
}

export { DEFAULT_PATHS as DEFAULT_DATA_PATHS };
