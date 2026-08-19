const properties = {

	exampleString: {
		type: 'string',
		description: 'the name of the vertex',
		default: null,
		minLength: 1,
		maxLength: 100
	},

	exampleStringWithLimitedAllowedValues: {	
		type: 'string',
		description: 'the name of the vertex',
		default: null,
		validValues: [ 'foo', 'bar', 'baz' ]
	},

	exampleBool: {
		type: 'boolean',
		description: 'a boolean value',
		default: false
	},

	exampleInteger: {
		type: 'integer',
		description: 'an integer value',
		default: 0,
		min: 0,
		max: 100
	},

	exampleNumber: {
		type: 'number',
		description: 'a number with decimals (double)',
		default: 0.0,
		min: 0.0,
		max: 100.0
	},

	exampleTimestamp: {
		type: 'timestamp',
		description: 'a timestamp',
		default: () => {

			return new Date().toISOString(); 

		}
	},

	exampleObject: {
		type: 'object',
		description: 'some object',
		properties: {
			someString: {
				type: 'string',
				description: 'the someString property'
			},
			someNumber: {
				type: 'number',
				description: 'the someNumber property'
			}
		}
	},

	exampleArray: {
		type: 'array',
		description: 'some array',
		items: {
			type: 'string',
			description: 'the item in the array'
		}
	},

	exampleArrayOfObjects: {
		type: 'array',
		description: 'some array of objects',
		items: {
			type: 'object',
			description: 'an object in the array',
			properties: {
				someString: {
					type: 'string',
					description: 'the someString property'
				},
				someNumber: {
					type: 'number',
					description: 'the someNumber property'
				}
			}
		}
	}

};


// formatting for user with intellisense
const edges = [
	[ 'user', 'someEdge', 'template' ]
];


const relatedKVs = {
	'template::someCachedThing::{{template.id}}': {
		type: 'array',
		description: 'an array of things',
		items: {
			type: 'string',
			description: 'a thing'
		}
	}
};


export default {
	name: 'template',
	description: `example object`,
	properties,
	edges,
	relatedKVs
};