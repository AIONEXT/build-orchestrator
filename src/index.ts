/**
 * Build Orchestrator: Build-Review-Test-Fix-Rebuild-Validate-Test-Deploy pipeline
 */

import axios from "axios";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";

export interface PipelineStage {
  name: string;
  command: string;
  timeout?: number;
  retries?: number;
  continueOnFailure?: boolean;
  artifacts?: string[];
}

export interface PipelineConfig {
  name: string;
  stages: PipelineStage[];
  repository: string;
  branch: string;
  triggers: {
    push?: boolean;
    pullRequest?: boolean;
    schedule?: string;
  };
  notifications?: {
    slack?: string;
    email?: string[];
  };
}

export interface PipelineResult {
  stage: string;
  success: boolean;
  duration: number;
  output: string;
  artifacts: string[];
  error?: string;
}

export class BuildOrchestrator {
  private config: PipelineConfig;
  private results: PipelineResult[] = [];
  private githubToken: string;

  constructor(config: PipelineConfig, githubToken: string) {
    this.config = config;
    this.githubToken = githubToken;
  }

  async run(): Promise<PipelineResult[]> {
    console.log(`Starting pipeline: ${this.config.name}`);

    for (const stage of this.config.stages) {
      const result = await this.runStage(stage);
      this.results.push(result);

      if (!result.success && !stage.continueOnFailure) {
        console.error(`Stage ${stage.name} failed, stopping pipeline`);
        await this.notifyFailure(result);
        break;
      }

      if (!result.success && stage.retries && stage.retries > 0) {
        console.log(`Retrying ${stage.name} (${stage.retries} retries left)`);
        const retryResult = await this.runStage(stage, stage.retries);
        this.results[this.results.length - 1] = retryResult;
        if (!retryResult.success && !stage.continueOnFailure) {
          await this.notifyFailure(retryResult);
          break;
        }
      }
    }

    return this.results;
  }

  private async runStage(stage: PipelineStage, retries = 0): Promise<PipelineResult> {
    const start = Date.now();
    console.log(`Running stage: ${stage.name}`);

    try {
      const output = await this.executeCommand(stage.command, stage.timeout || 300000);
      const artifacts = await this.collectArtifacts(stage.artifacts || []);

      return {
        stage: stage.name,
        success: true,
        duration: Date.now() - start,
        output,
        artifacts,
      };
    } catch (error) {
      const err = error as Error;
      return {
        stage: stage.name,
        success: false,
        duration: Date.now() - start,
        output: err.message,
        artifacts: [],
        error: err.message,
      };
    }
  }

  private async executeCommand(command: string, timeout: number): Promise<string> {
    // In a real implementation, this would use child_process.exec
    // For now, return a mock output
    console.log(`Executing: ${command}`);
    return `Executed: ${command}`;
  }

  private async collectArtifacts(patterns: string[]): Promise<string[]> {
    const artifacts: string[] = [];
    for (const pattern of patterns) {
      // Mock artifact collection
      artifacts.push(`artifact-${pattern}-${Date.now()}.tar.gz`);
    }
    return artifacts;
  }

  private async notifyFailure(result: PipelineResult): Promise<void> {
    if (this.config.notifications?.slack) {
      await this.sendSlackNotification(result);
    }
    if (this.config.notifications?.email) {
      await this.sendEmailNotification(result);
    }
  }

  private async sendSlackNotification(result: PipelineResult): Promise<void> {
    await axios.post(this.config.notifications!.slack!, {
      text: `Pipeline ${this.config.name} failed at stage ${result.stage}: ${result.error}`,
    });
  }

  private async sendEmailNotification(result: PipelineResult): Promise<void> {
    // Mock email sending
    console.log(`Email sent to ${this.config.notifications?.email?.join(", ")}`);
  }

  async generateReport(): Promise<string> {
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const successCount = this.results.filter(r => r.success).length;

    return `
# Pipeline Report: ${this.config.name}

**Total Duration:** ${totalDuration}ms
**Stages:** ${this.results.length}
**Passed:** ${successCount}/${this.results.length}

## Stage Results
${this.results.map(r => `- ${r.stage}: ${r.success ? "✅ PASS" : "❌ FAIL"} (${r.duration}ms)${r.error ? ` - ${r.error}` : ""}`).join("\n")}

## Artifacts
${this.results.flatMap(r => r.artifacts).map(a => `- ${a}`).join("\n") || "No artifacts"}
`;
  }
}

export async function loadConfig(configPath: string): Promise<PipelineConfig> {
  const content = await fs.readFile(configPath, "utf-8");
  if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
    return yaml.parse(content);
  }
  return JSON.parse(content);
}