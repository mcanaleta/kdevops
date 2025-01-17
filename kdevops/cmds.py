import subprocess


def cmd(command):
    # Run a shell command
    subprocess.run(command, shell=True, check=True)


def cmd_output(command):
    # Run a shell command and return the output
    return subprocess.check_output(command, shell=True).decode().strip()


def cmd_nocheck(cmd_str):
    try:
        return cmd(cmd_str)
    except Exception as e:
        pass
