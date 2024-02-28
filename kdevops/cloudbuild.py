from pathlib import Path

from . import GCBMicroservice


def cloudbuild_generate(service: GCBMicroservice):
    image_url_tag = f"{service.image_url}:$COMMIT_SHA"
    image_url_tag_latest = f"{service.image_url}:latest"
    # if the project has a Dockerfile:
    is_docker = Path("Dockerfile").exists()
    # image_url_tag = f'{service.image_url}:latest'

    docker_step = f"""  - name: gcr.io/cloud-builders/docker
    id: Build
    args:
      - build
      - -t
      - {image_url_tag}
      - -t
      - {image_url_tag_latest}
      - ."""

    buildpack_step = f"""  - name: gcr.io/k8s-skaffold/pack
    entrypoint: pack
    id: Buildpack
    args:
      - build
      - {image_url_tag}
      - "--builder=gcr.io/buildpacks/builder:v1"
      - "--network=cloudbuild"
      - "--path=.\"
  - name: gcr.io/cloud-builders/docker
    id: Tag
    args:
      - tag
      - {image_url_tag}
      - {image_url_tag_latest}"""

    first_step = docker_step if is_docker else buildpack_step

    contents = f"""steps:
{first_step}
  - name: gcr.io/cloud-builders/docker
    id: Push
    args:
      - push
      - {image_url_tag}
  - name: gcr.io/cloud-builders/docker
    id: Push latest
    args:
      - push
      - {image_url_tag_latest}
  - name: "gcr.io/google.com/cloudsdktool/cloud-sdk:slim"
    id: Deploy Cloud Run Service  
    entrypoint: gcloud
    args:
      - run
      - services
      - update
      - {service.image_name}
      - "--image={image_url_tag}"
      - "--region={service.region}"
      - "--project=$PROJECT_ID"
      - --quiet
images:
  - {image_url_tag}
  - {image_url_tag_latest}
options:
  logging: CLOUD_LOGGING_ONLY
projectId: {service.project_id}"""
    with open(f"cloudbuild.yaml", "w") as f:
        f.write(contents)
