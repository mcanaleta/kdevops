import * as path from "path";
import * as fs from "fs";
import { GCBMicroservice } from "../entities/RunService";
import { stringify } from "yaml";

export function cloudbuild_generate(service: GCBMicroservice): void {
  const image_url_tag = `${service.image_url}:$COMMIT_SHA`;
  const image_url_tag_latest = `${service.image_url}:latest`;
  const is_docker = fs.existsSync(path.resolve("Dockerfile"));

  const docker_step = {
    name: "gcr.io/cloud-builders/docker",
    id: "Build",
    args: ["build", "-t", image_url_tag, "-t", image_url_tag_latest, "."],
  };

  const buildpack_step = {
    name: "gcr.io/k8s-skaffold/pack",
    entrypoint: "pack",
    id: "Buildpack",
    args: [
      "build",
      image_url_tag,
      "--builder=gcr.io/buildpacks/builder:v1",
      "--network=cloudbuild",
      "--path=./",
    ],
  };

  const first_step = is_docker ? docker_step : buildpack_step;

  const cloudbuild = {
    steps: [
      first_step,
      {
        name: "gcr.io/cloud-builders/docker",
        id: "Push",
        args: ["push", image_url_tag],
      },
      {
        name: "gcr.io/cloud-builders/docker",
        id: "Push latest",
        args: ["push", image_url_tag_latest],
      },
      {
        name: "gcr.io/google.com/cloudsdktool/cloud-sdk:slim",
        id: "Deploy Cloud Run Service",
        entrypoint: "gcloud",
        args: [
          "run",
          "services",
          "update",
          service.image_name,
          `--image=${image_url_tag}`,
          `--region=${service.region}`,
          "--project=$PROJECT_ID",
          "--quiet",
        ],
      },
    ],
    images: [image_url_tag, image_url_tag_latest],
    options: { logging: "CLOUD_LOGGING_ONLY" },
    projectId: service.project_id,
  };

  const contents = stringify(cloudbuild);
  fs.writeFileSync("cloudbuild.yaml", contents);
}
