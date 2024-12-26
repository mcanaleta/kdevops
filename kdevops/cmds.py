import subprocess


def cmd(command):
    # Run a shell command
    subprocess.run(command, shell=True, check=True)


def cmd_output(command):
    # Run a shell command and return the output
    return subprocess.check_output(command, shell=True).decode().strip()
