// Standard vocabularies
export const rdf = {
  type: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
};

export const xsd = {
  integer: 'http://www.w3.org/2001/XMLSchema#integer',
  base64: 'http://www.w3.org/2001/XMLSchema#base64Binary',
};

// Custom membership vocabulary
export const mem = {
  BloomFilter: 'http://semweb.mmlab.be/ns/membership#BloomFilter',
  hashFunction: 'http://semweb.mmlab.be/ns/membership#hashFunction',
  sourceCollection: 'http://semweb.mmlab.be/ns/membership#sourceCollection',
  memberCollection: 'http://semweb.mmlab.be/ns/membership#memberCollection',
  binaryRepresentation: 'http://semweb.mmlab.be/ns/membership#binaryRepresentation',
  bitSize: 'http://semweb.mmlab.be/ns/membership#bitSize',
  hashSize: 'http://semweb.mmlab.be/ns/membership#hashSize',
  projectedProperty: 'http://semweb.mmlab.be/ns/membership#projectedProperty',
  projectedResource: 'http://semweb.mmlab.be/ns/membership#projectedResource',
};
