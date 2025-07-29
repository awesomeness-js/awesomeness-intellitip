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
        "schemas": { // will look for a file in that directory with the target name
            "@schemas": "schemas",
        },
        "components": { 
            "@ui": "awesomeness-ui/components",
            "ui": "awesomeness-ui/components",
            "app": "api/functions",
        },
    }
}
```

## 🎯 Usage

If you're using `awesomeness-ui` components or `awesomeness-api/routes`, each component or route should ideally live in its own folder with either a `readme.md` or `_info.js` file to describe it.


#### 🔧 Example Config: `.vscode/settings.json`

```json
{
  "awesomeness": {
    "debug": true,
    "schemas": {
      "@schemas": "schemas"
    },
    "components": {
      "ui": "awesomeness-ui/components",
      "app": "api/functions"
    }
  }
}
```

---

### 📚 File Resolution Priority

For **components** (like those in `awesomeness-ui/components` or `api/functions`):

- If the reference is shallow (e.g. `ui._example()`):
  1. `awesomeness-ui/example/readme.md`
  2. `awesomeness-ui/example/_info.js`

- If the reference is nested (e.g. `ui._example.subComponent()`):
  1. `awesomeness-ui/example/subComponent.md`
  2. `awesomeness-ui/example/subComponent/readme.md`
  3. `awesomeness-ui/example/subComponent/_info.js`

For **schemas** (like those in `schemas`), the lookup directly resolves to:
- `schemas/mySchema.js`



### 🧑‍💻 Example Usage
```js
// FRONT END
import ui from '#ui';

// will look for:
// 1. awesomeness-ui/example/readme.md
// 2. awesomeness-ui/example/_info.js
const test = ui._example();

// will look for:
// 1. awesomeness-ui/example/subComponent.md
// 2. awesomeness-ui/example/subComponent/readme.md
// 3. awesomeness-ui/example/subComponent/_info.js
const testGrid = ui._example.subComponent();

// will look for:
// 1. awesomeness-ui/example/subComponent/deep.md
// 2. awesomeness-ui/example/subComponent/deep/readme.md
// 3. awesomeness-ui/example/subComponent/deep/_info.js
const $subDeep = ui._example.subComponent.deep();
```

### Basic Example
![](./images/example.png)

### Backend Component
![](./images/component-backend.png)

### Component with Image
![](./images/component-with-image.png)


## 📑 Schemas
While Schemas can be any object structure, the following keys have special meaning and display in the hover:
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
![](./images/schema.png)
![](./images/schema2.png)

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

![](./images/schema-details.png)

### Edges
user -- friend --> user

![](./images/schema-edges.png)


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

![](./images/schema-kv.png)
