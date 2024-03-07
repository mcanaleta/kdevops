import { execFileSync } from "child_process";
import { cloudbuild_generate } from "../lib/cloudbuild";
import {
  TerraformFile,
  TerraformProject,
  TFExpression,
  TFProjectRole,
  TFSecretRole,
} from "../lib/terraform";
import { GCBSchedule } from "./Schedule";
import { GCBWorkflow } from "./Workflow";
import { run } from "../lib/cmds";
export type GCBMicroserviceProps = {
  project_id: string;
  name: string;
  terraform_bucket: string;
  terraform_prefix: string;
  domain?: string;
  env?: Record<string, string>;
  env_prod?: Record<string, string>;
  secrets?: Record<string, string>;
  service_account?: string;
  schedules?: GCBSchedule[];
  workflows?: GCBWorkflow[];
  project_roles?: string[];
  isPublic?: boolean;
  region?: string;
  registry_region?: string;
  scheduler_region?: string;
  cpu?: string;
  memory?: string;
  github_user: string;
  github_repo: string;
  cloudbuild_region?: string;
  server_root?: string;
};

export class GCBMicroservice {
  constructor(public props: GCBMicroserviceProps) {}

  public project_id = this.props.project_id;
  public name = this.props.name;
  public terraform_bucket = this.props.terraform_bucket;
  public terraform_prefix = this.props.terraform_prefix;
  public domain = this.props.domain;
  public env = this.props.env ?? {};
  public env_prod = this.props.env_prod ?? {};
  public secrets = this.props.secrets ?? {};
  public service_account = this.props.service_account;
  public schedules = this.props.schedules ?? [];
  public workflows = this.props.workflows ?? [];
  public project_roles = this.props.project_roles ?? [];
  public isPublic = this.props.isPublic ?? true;
  public region = this.props.region ?? "europe-west1";
  public registry_region = this.props.registry_region ?? "europe";
  public scheduler_region = this.props.scheduler_region ?? "europe-west1";
  public cpu = this.props.cpu ?? "1000m";
  public memory = this.props.memory ?? "1G";
  public github_user = this.props.github_user;
  public github_repo = this.props.github_repo;
  public cloudbuild_region = this.props.cloudbuild_region ?? "europe-west1";
  public registry = `${this.registry_region}-docker.pkg.dev`;
  public server_root = this.props.server_root ?? ".";
  public image_name = this.name;
  public image_url = `${this.registry}/${this.project_id}/${this.image_name}/${this.image_name}`;
  public image_url_latest = `${this.image_url}:latest`;
  public localarch_image_url = `${this.image_name}_localarch`;
  public sa_cloudbuild = `${this.name}-cloudbuild`;
  public sa_scheduler = `${this.name}-scheduler`;

  // Rest of the code...

  init(): void {
    this.generate();
    // run terraform init in folder ./terraform/
  }

  apply(): void {
    console.log("Generating infra");
    this.generate();
    // run terraform apply in folder ./terraform/
  }

  generate(): void {
    this.generate_terraform();
    this.generate_cloudbuild();
  }

  generate_terraform(): void {
    const project = new TerraformProject();
    project.files.push(this.generate_main());
    project.files.push(this.generate_secrets());
    project.files.push(this.generate_iam());
    project.files.push(this.generate_ci());
    project.files.push(this.generate_cloudrun());
    project.files.push(this.generate_google_services());
    project.files.push(this.generate_schedules());
    project.generateContents();
  }

  generate_cloudbuild(): void {
    cloudbuild_generate(this);
  }

  generate_main(): TerraformFile {
    const base = new TerraformFile("main");
    base.content.push({
      _type: "terraform",
      required_providers: {
        google: {
          _includeEquals: true,
          source: "hashicorp/google",
        },
      },
      backend_gcs: {
        _type: "backend",
        _name: "gcs",
        bucket: this.terraform_bucket,
        prefix: this.terraform_prefix,
      },
    });

    base.content.push({
      _type: "provider",
      _name: "google",
      project: this.project_id,
      region: this.region,
    });

    return base;
  }

  generate_google_services(): TerraformFile {
    const google_services = [
      "artifactregistry",
      "run",
      "cloudbuild",
      "secretmanager",
      "iam",
      "cloudscheduler",
      "sheets",
    ];

    const file = new TerraformFile("google_services");
    for (const service of google_services) {
      file.content.push({
        _resource: "google_project_service",
        _name: service,
        project: this.project_id,
        service: `${service}.googleapis.com`,
      });
    }
    return file;
  }

  generate_secrets(): TerraformFile {
    const secrets = new TerraformFile("secrets");
    for (const [k, v] of Object.entries(this.secrets)) {
      secrets.content.push({
        _resource: "google_secret_manager_secret",
        _name: v,
        secret_id: v,
        replication: { auto: {} },
        depends_on: [new TFExpression("google_project_service.secretmanager")],
      });
    }

    return secrets;
  }

  generate_ci(): TerraformFile {
    const ci = new TerraformFile("ci");
    ci.content.push({
      _resource: "google_artifact_registry_repository",
      _name: this.name,
      location: this.registry_region,
      repository_id: this.name,
      format: "DOCKER",
      depends_on: [new TFExpression("google_project_service.artifactregistry")],
    });

    const repo = this.github_repo || this.name;
    ci.content.push({
      _resource: "google_cloudbuildv2_repository",
      _name: this.name,
      location: this.cloudbuild_region,
      name: repo,
      parent_connection: "github",
      remote_uri: `https://github.com/${this.github_user}/${repo}.git`,
    });

    ci.content.push({
      _resource: "google_cloudbuild_trigger",
      _name: this.name,
      name: this.name,
      location: this.cloudbuild_region,
      filename: "cloudbuild.yaml",
      service_account: `projects/${this.project_id}/serviceAccounts/\${google_service_account.${this.sa_cloudbuild}.email}`,
      repository_event_config: {
        repository: new TFExpression(
          `google_cloudbuildv2_repository.${this.name}.id`
        ),
        push: { branch: "^main$" },
      },
    });
    return ci;
  }

  generate_cloudrun(): TerraformFile {
    const file = new TerraformFile("cloudrun");

    const service = {
      _resource: "google_cloud_run_v2_service",
      _name: this.name,
      name: this.name,
      location: this.region,
      template: {
        containers: {
          image: `${this.image_url}:latest`,
          resources: {
            limits: {
              _includeEquals: true,
              cpu: this.cpu,
              memory: this.memory,
            },
            cpu_idle: new TFExpression("true"),
          },
        },
        service_account: new TFExpression(
          `google_service_account.${this.name}.email`
        ),
      },
      lifecycle: {
        ignore_changes: [
          new TFExpression("template[0].containers[0].image"),
          new TFExpression("client"),
          new TFExpression("client_version"),
        ],
      },
    };

    for (const [k, v] of Object.entries(this.secrets)) {
      service.template.containers[`env_scret${k}`] = {
        _type: "env",
        name: k,
        value_source: {
          secret_key_ref: {
            secret: new TFExpression(
              `google_secret_manager_secret.${v}.secret_id`
            ),
            version: "latest",
          },
        },
      };
    }

    const merged_env = { ...this.env, ...this.env_prod };
    for (const [k, v] of Object.entries(merged_env)) {
      service.template.containers[`env${k}`] = {
        _type: "env",
        name: k,
        value: v,
      };
    }

    file.content.push({
      _data: "google_iam_policy",
      _name: "noauth",
      binding: { role: "roles/run.invoker", members: ["allUsers"] },
    });

    if (this.isPublic) {
      file.content.push({
        _resource: "google_cloud_run_v2_service_iam_policy",
        _name: "noauth",
        project: this.project_id,
        location: new TFExpression(
          `google_cloud_run_v2_service.${this.name}.location`
        ),
        name: new TFExpression(`google_cloud_run_v2_service.${this.name}.name`),
        policy_data: new TFExpression(
          "data.google_iam_policy.noauth.policy_data"
        ),
      });
    }

    file.content.push(service);
    if (this.domain) {
      const domain_mapping = {
        _resource: "google_cloud_run_domain_mapping",
        _name: this.name,
        location: this.region,
        name: this.domain,
        spec: {
          route_name: new TFExpression(
            `google_cloud_run_v2_service.${this.name}.name`
          ),
        },
        metadata: {
          namespace: this.project_id,
        },
        depends_on: [
          new TFExpression(`google_cloud_run_v2_service.${this.name}`),
        ],
      };
      file.content.push(domain_mapping);
    }
    return file;
  }

  generate_iam(): TerraformFile {
    const iam = new TerraformFile("iam");

    iam.addServiceAccount(this.name, [
      ...this.project_roles.map((r) => new TFProjectRole(r, this.project_id)),
      ...Object.values(this.secrets).map((s) => new TFSecretRole(s)),
    ]);

    iam.content.push({
      _resource: "google_service_account_key",
      _name: this.name,
      service_account_id: new TFExpression(
        `google_service_account.${this.name}.id`
      ),
    });

    iam.content.push({
      _resource: "local_file",
      _name: `${this.name}_key`,
      filename: `${this.name}-key.json`,
      content: new TFExpression(
        `base64decode(google_service_account_key.${this.name}.private_key)`
      ),
    });

    iam.addServiceAccount(this.sa_cloudbuild, [
      new TFProjectRole("run.developer", this.project_id),
      new TFProjectRole("cloudbuild.builds.editor", this.project_id),
      new TFProjectRole("logging.logWriter", this.project_id),
      new TFProjectRole("artifactregistry.writer", this.project_id),
      new TFProjectRole("iam.serviceAccountUser", this.project_id),
    ]);

    iam.addServiceAccount(this.sa_scheduler, [
      new TFProjectRole("run.invoker", this.project_id),
    ]);
    return iam;
  }

  generate_schedules(): TerraformFile {
    const schedules = new TerraformFile("schedules");
    for (const schedule of this.schedules) {
      const bodyjson = JSON.stringify(schedule.body);
      const bodydoublejson = JSON.stringify(bodyjson);
      const bodyexpression = `base64encode(${bodydoublejson})`;
      schedules.content.push({
        _resource: "google_cloud_scheduler_job",
        _name: schedule.name,
        name: schedule.name,
        schedule: schedule.frequency,
        time_zone: "Europe/Madrid",
        region: this.scheduler_region,
        http_target: {
          http_method: "POST",
          uri: new TFExpression(
            `"\${google_cloud_run_v2_service.${this.name}.uri}/${schedule.path}"`
          ),
          body: new TFExpression(bodyexpression),
          headers: {
            _includeEquals: true,
            "Content-Type": "application/json",
          },
          oidc_token: {
            service_account_email: new TFExpression(
              `google_service_account.${this.sa_scheduler}.email`
            ),
          },
        },
        depends_on: [
          new TFExpression(`google_cloud_run_v2_service.${this.name}`),
          new TFExpression(`google_project_service.cloudscheduler`),
        ],
      });
    }
    return schedules;
  }

  getenv(): void {
    // Implementation for the `getenv` method
  }

  async build(tag?: string) {
    tag = tag ?? `local${Math.floor(Date.now() / 1000)}`;
    const image_url_tag = `${this.image_url}:${tag}`;
    await run("docker", [
      "buildx",
      "build",
      "--progress",
      "plain",
      "--platform",
      "linux/amd64",
      "-t",
      image_url_tag,
      "-t",
      this.image_url_latest,
      ".",
    ]);
    return tag;
  }

  async buildlocalarch() {
    await run("docker", [
      "build",
      "--progress",
      "plain",
      "-t",
      this.localarch_image_url,
      ".",
    ]);
    return this.localarch_image_url;
  }

  async push(tag?: string) {
    tag = await this.build(tag);
    const image_url_tag = `${this.image_url}:${tag}`;
    await run("docker", ["push", image_url_tag]);
    await run("docker", ["push", this.image_url_latest]);
    return tag;
  }

  async deploy() {
    const tag = await this.push();
    const image_url_tag = `${this.image_url}:${tag}`;
    await run("gcloud", [
      "run",
      "services",
      "update",
      this.name,
      "--image=" + image_url_tag,
      "--region=" + this.region,
      "--project=" + this.project_id,
    ]);
    // Implementation for the `deploy` method
  }

  async localrun() {
    const tag = await this.buildlocalarch();
    await run("docker", [
      "run",
      "--rm",
      "-p",
      "8080:8080",
      "--env-file",
      "./.env.local.docker",
      "-v",
      `./terraform/${this.name}-key.json:/app/${this.name}-key.json`,
      "backoffice_localarch",
    ]);
  }

  main(): void {
    const cmd = process.argv[2];
    if (cmd === "build") {
      this.build();
    }
    if (cmd === "buildlocalarch") {
      this.buildlocalarch();
    }
    if (cmd === "push") {
      this.push();
    }
    if (cmd === "deploy") {
      this.deploy();
    }
    if (cmd === "infra") {
      this.apply();
    } else if (cmd === "getenv") {
      this.getenv();
    } else if (cmd === "init") {
      this.init();
    } else if (cmd === "localrun") {
      this.localrun();
    }
  }
}
