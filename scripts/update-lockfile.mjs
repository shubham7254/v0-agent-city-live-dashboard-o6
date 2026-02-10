import { execSync } from "child_process";
console.log("Updating pnpm-lock.yaml...");
execSync("pnpm install --no-frozen-lockfile", { stdio: "inherit", cwd: "/vercel/share/v0-project" });
console.log("Lockfile updated successfully.");
