# usage instructions

Prerequisites:

- have a kdevops.ts file
- have a Dockerfile

```bash
pnpm add --dev @mcanaleta/kdevops
```

add following script in package.json

```json
"scripts": {
    (...)
    "devops": "kdevops"
}
```

```bash
pnpm devops init
cd terraform
terraform init
pnpm run devops build 
```

work in progress

# opinionated

- pnpm
- luxon
- lodash
- typescript
- swc
- firebase, firestore
- google cloud
- react
- trpc

devops tools

the idea is to define a kdevops.ts file in the root of the project
then run pnpm run devops ... to execute the devops tasks:

- generate terraform files
- generate cloudbuild.yaml
...

Example of kdevops.ts file:

```ts
import { GCBMicroservice } from "@mcanaleta/kdevops";

const service = new GCBMicroservice({
  name: "backoffice",

...
});

service.cli();
```

add swc-node to the project:

```
pnpm add -D @swc-node/register
```

In package.json set:

```
"scripts": {
  "devops": "node -r @swc-node/register kdevops.ts"
}
```

Then run:

```
pnpm run devops
```

## Add to a project

```
pnpm add -w -D github:mcanaleta/kdevops
```
