from jinja2 import Template
from pathlib import Path


def render(templates_dir: Path, dest_dir: Path, vars: dict):
    """Render the templates in the templates_dir to the dest_dir using the vars."""
    if len(list(dest_dir.iterdir())) > 0:
        raise ValueError("Destination directory is not empty.")

    for f in templates_dir.iterdir():
        print(f"Rendering {f}")
        if not f.name.endswith(".yaml"):
            continue
        template = Template(f.read_text())
        output = template.render(vars)
        (dest_dir / f.name).write_text(output)
    print("Done rendering.")
