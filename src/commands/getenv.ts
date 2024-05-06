import { relative } from "path";
import { GCBMicroservice } from "../entities/RunService";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { google } from "googleapis";

function keyPath(service: GCBMicroservice) {
  mkdirSync(`./keys`, { recursive: true });
  return `./keys/${service.name}-key.json`;
}
export async function createKey(service: GCBMicroservice, force = false) {
  if (existsSync(keyPath(service)) && !force) {
    console.log("Key already exists");
    return;
  }
  console.log(`Creating key ${keyPath(service)}`);
  const authClient = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const res = await google.iam("v1").projects.serviceAccounts.keys.create({
    name: `projects/${service.project_id}/serviceAccounts/${service.service_account}@${service.project_id}.iam.gserviceaccount.com`,
    requestBody: {
      privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
    },
    auth: authClient,
  });
  const { privateKeyData } = res.data;
  if (!privateKeyData) {
    throw new Error("No private key data returned from IAM API");
  }
  const decoded = Buffer.from(privateKeyData, "base64").toString("utf-8");

  writeFileSync(keyPath(service), decoded);
}

export async function getEnv(service: GCBMicroservice) {
  await createKey(service);
  const envLocal = [] as string[];
  const envDocker = [] as string[];
  for (const [k, v] of Object.entries({
    ...service.env,
    ...service.env_local,
  })) {
    envLocal.push(`${k}=${v}`);
  }
  for (const [k, v] of Object.entries(service.env)) {
    envDocker.push(`${k}=${v}`);
  }
  const sm = new SecretManagerServiceClient({
    projectId: service.project_id,
  });
  for (const [k, v] of Object.entries(service.secrets)) {
    // const value = await runReturn(
    //   "gcloud",
    //   `secrets versions access latest --secret=${v} --project=${service.project_id}`.split(
    //     " "
    //   )
    // );
    const [version] = await sm.accessSecretVersion({
      name: `projects/${service.project_id}/secrets/${v}/versions/latest`,
    });
    const value = version.payload?.data?.toString();
    envLocal.push(`${k}=${value}`);
    envDocker.push(`${k}=${value}`);
  }
  const rel_path = relative(service.server_root, keyPath(service));
  envLocal.push(`GOOGLE_APPLICATION_CREDENTIALS=${rel_path}`);
  envDocker.push(
    `GOOGLE_APPLICATION_CREDENTIALS=/app/${service.name}-key.json`
  );

  writeFileSync(`${service.server_root}/.env.local`, envLocal.join("\n"));
  writeFileSync(`.env.local.docker`, envDocker.join("\n"));
}
