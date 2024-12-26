from setuptools import setup, find_packages

setup(
    name="kdevops",  # Package name
    version="0.1.0",  # Initial version
    author="Marc Canaleta",
    description="Devops tools",
    # long_description=open("README.md").read(),
    # long_description_content_type="text/markdown",
    url="https://github.com/mcanaleta/kdevops",
    packages=find_packages(),  # Automatically find all packages in the project
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10",  # Minimum Python version
    install_requires=[
        "requests",  # Example dependency
        "PyYAML",
        "jinja2"
    ],
)
