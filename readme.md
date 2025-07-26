# Awesomeness Tooltip - VS Code Extension

## 📌 Overview
Awesomeness Tooltip is a Visual Studio Code extension that provides helpful tooltips for JavaScript files. It extracts schema information based on configured path aliases and displays detailed hover tooltips, making it easier to understand object structures and relationships within your project.

Provides way more information than the default hover, intellisense, or peek definition (even with TS).


## 🚀 Features
- 📝 **Hover Tooltips**: Displays structured tooltips with schema descriptions, properties, edges, and related key-value pairs.
- 🔄 **Dynamic Schema Loading**: Fetches schema information dynamically from configured paths.
- 🖥 **Customizable Configuration**: Supports custom path mappings for schema locations.
- 📡 **Efficient Caching & Watching**: Utilizes caching and file watching to enhance performance.
- 📢 **Debugging Output Channel**: Provides logs in a dedicated "Awesomeness Tooltip" output channel.

## 🛠 Configuration
This extension requires configuring path aliases to locate schema files. You can set these mappings in your VS Code settings (`settings.json`):

```json
{
  "awesomeness": {
    "schemas": {
			"@schemas": "schemas",
    },
		"uiComponents": {
			"@ui": "awesomeness-ui/components",
		},
	}
}
```

## 🎯 Usage
put a comment anywhere and see docs
```js

// @schemas user <-- hover over and watch the magic happen
let user = {

};

```

## 📑 Schemas
While Schemas can be any object structure, the following keys have special keys:
 - **name**: the name of a schema
 - **description**: the description of a schema
 - **properties**: the properties of a schema
 - **edges**: the edges of a schema (vertices that are connected to this schema)
 - **relatedKVs**: the key-value pairs related to this schema

See [example schema](examples/schemas/user.js) for a full example.

# Example Hover Display

### user
A user of an application

```js

user { 
    id: uuid
    first: string
    last: string
    phone: array
    email: array
    password: string
 }

```

### Details
```js
{
  id: {
    type: uuid,
    description: "the id of the vertex",
    default: () => { return uuid(); },
    immutable: true,
    required: true
  },
  first: {
    type: string,
    description: "first name of the user",
    default: null,
    minLength: 1,
    maxLength: 100
  },
  last: {
    type: string,
    description: "last name of the user",
    default: null,
    minLength: 1,
    maxLength: 100
  },
  phone: {
    type: array,
    description: "phone numbers of the user",
    items: {
      $ref: "phone"
    }
  },
  email: {
    type: array,
    description: "email addresses of the user",
    items: {
      $ref: "email"
    }
  },
  password: {
    type: string,
    description: "hashed password of the user",
    default: null
  }
}

```
### Edges
user -- friend --> user


### Related KVs

```js 
user::{{ application.id }}::email::{{ user.email }}
{
  type: string,
  description: "uuid of the user",
  example: "00000000-0000-0000-0000-000000000000"
}

user::{{ application.id }}::phone::{{ user.phone }}
{
  type: string,
  description: "uuid of the user",
  example: "00000000-0000-0000-0000-000000000000"
}
```