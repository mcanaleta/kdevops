from . import GCBMicroservice


def cloudbuild_generate(service: GCBMicroservice):
    image_url_tag = f"{service.image_url}:$COMMIT_SHA"
    image_url_tag_latest = f"{service.image_url}:latest"
    # image_url_tag = f'{service.image_url}:latest'

    contents = f"""steps:
  - name: gcr.io/cloud-builders/docker
    id: Build
    args:
      - build
      - -t
      - {image_url_tag}
      - -t
      - {image_url_tag_latest}
      - .
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
