export default [
	// Here is where we fix "padding-line-between-statements"
	{
		rules: {
			'padding-line-between-statements': [
				'error',
				// Insert a blank line **before** any block-like statement
				{
					blankLine: 'always',
					prev: '*',
					next: 'block-like' 
				},
				// Insert a blank line **after** any block-like statement
				{
					blankLine: 'always',
					prev: 'block-like',
					next: '*' 
				},
				// Keep the rest of your rules here as needed...
				{
					blankLine: 'always',
					prev: '*',
					next: 'function' 
				},
				{
					blankLine: 'always',
					prev: 'function',
					next: '*' 
				},
				{
					blankLine: 'always',
					prev: '*',
					next: 'throw' 
				}
			],
			'padded-blocks': [
				'error',
				{
					blocks: 'always',
					classes: 'always',
					switches: 'always'
				}
			],

			"object-curly-newline": [
				"error",
				{
					ObjectExpression: {
						minProperties: 2,     // If object has 2+ props, break into multiple lines
						multiline: true,
						consistent: true
					},
					// You can also configure ImportDeclaration, ExportDeclaration, etc.
					ObjectPattern: {
						multiline: true,
						minProperties: 2,
						consistent: true
					},
					ImportDeclaration: {
						multiline: true,
						minProperties: 2
					},
					ExportDeclaration: {
						multiline: true,
						minProperties: 2
					}
				}
			],

			// 2) If the object is multiline, put each property on its own line
			"object-property-newline": [
				"error",
				{
					allowAllPropertiesOnSameLine: false
				}
			],

			indent: [ "error", "tab", { "SwitchCase": 1 } ],
			semi: [ "error", "always" ],
			"arrow-parens": [ "error", "always" ],
			"object-curly-spacing": [ "error", "always" ],
			"array-bracket-spacing": [ "error", "always" ],
			'lines-between-class-members': [ 'error', 'always' ],
			'newline-after-var': [ 'error', 'always' ],
			'newline-before-return': 'error',
			'brace-style': [ 'error', '1tbs', { allowSingleLine: false } ],
			"no-unreachable": "off"
		}
	}
];
