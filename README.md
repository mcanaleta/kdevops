# Kdevops

Kdevops is a collection of utilities and scripts to streamline development and operations tasks. It includes tools for watching file changes, interacting with 1Password, managing Kubernetes resources, and handling Docker operations.

> **Warning**: This project is in continuous development and subject to change.

## Features

- **Kubernetes Management**: Manage Kubernetes namespaces, secrets, and apply configurations.
- **Docker Operations**: Build, tag, and push Docker images, with support for Minikube.
- **File Watching**: Automatically trigger actions on file changes.
- **1Password Integration**: Inject secrets from 1Password into environment files and check for item existence.

## Installation

Install the required Python packages directly from the Git repository:

```sh
pip install git+https://github.com/mcanaleta/kdevops.git
```

## Usage

### Kubernetes Management

Manage Kubernetes resources using the `KubernetesContext` class:

```python
from kdevops.kubernetes import KubernetesContext

context = KubernetesContext(context="your-context", namespace="your-namespace")
context.ensure_namespace()
context.set_secret("secret-name", {"key": "value"})
context.kubectl("apply -f /path/to/resource.yaml")
context.kustomize("/path/to/kustomization")
```

Retrieve a Kubernetes secret:

```python
secret_data = context.get_secret("secret-name")
print("Secret data:", secret_data)
```

Set a Kubernetes secret from 1Password:

```python
context.set_secret_from_op("vault_name", "item_name", "kube_secret_name")
```

### Docker Operations

Build and push Docker images:

```python
from kdevops.docker import Docker

docker = Docker()
image_tag = docker.build(img="your-image", path=".", repo="your-repo")
print("Built image:", image_tag)
```

### 1Password Integration

Inject secrets from 1Password into an environment file:

```python
from kdevops.onepassword import op_eval_env_file

env_vars = op_eval_env_file("/path/to/env/file")
print(env_vars)
```

Check if a 1Password item exists:

```python
from kdevops.onepassword import op_item_exists

exists = op_item_exists("vault_name", "item_name")
print("Item exists:", exists)
```

### File Watching

Use the `util_watch` function to watch for file changes and trigger a callback function:

```python
from kdevops.watch import util_watch
from pathlib import Path

def on_change(event):
    print("File changed:", event)

util_watch(Path("/path/to/watch"), on_change)
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License.
