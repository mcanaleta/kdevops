from kdevops import cmds


def eval_env_file(f):
    contents = cmds.cmd_output(f"op inject -i {f}")
    result = {}
    for l in contents.split("\n"):
        parts = l.split("=")
        key = parts[0]
        value = "=".join(parts[1:])
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        result[key] = value
    return result
