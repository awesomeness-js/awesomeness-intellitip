import { uuid } from '@awesomeness-js/utils';

const properties = {

	// id is a special property that is required for all vertices - format uuid v4
	id: {
		type: 'uuid',
		description: 'the id of the vertex',
		default: () => { return uuid(); },
		immutable: true,
		required: true,
	},

	first: {
		type: 'string',
		description: 'first name of the user',
		default: null,
		minLength: 1,
		maxLength: 100,
	},

	last: {
		type: 'string',
		description: 'last name of the user',
		default: null,
		minLength: 1,
		maxLength: 100,
	},

	phone: {
		type: 'string',
		description: 'phone numbers of the user',
	},

	email: {
		type: 'string',
		description: 'email addresses of the user',
	},


}

const edges = Object.freeze({
	friend: 'friend'
});


const relatedKVs = {
	'user::{{ application.id }}::email::{{ user.email }}': {
		type: 'string',
		description: 'uuid of the user',
		example: '00000000-0000-0000-0000-000000000000',
	},
	'user::{{ application.id }}::phone::{{ user.phone }}': {
		type: 'string',
		description: 'uuid of the user',
		example: '00000000-0000-0000-0000-000000000000',
	}
};

export default {
	name: 'user',
	description: `A user of an application`,
	properties,
	edges,
	relatedKVs
};