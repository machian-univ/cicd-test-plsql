import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type { SecurityResult, AgentResult, SecurityUnavailableReason } from '../../core/types.js';
import { runSecurityScan, runDiffSecurityScan } from '../../analysis/SecurityScanner.js';
import { git } from '../../utils/git.js';

export class SecurityScanAgent implements Agent<SecurityResult> {
  readonly name = 'SecurityScanAgent';

  async run(context: RunContext): Promise<AgentResult<SecurityResult>> {
    const start = Date.now();

    try {
      const projectRoot = context.get('projectRoot');
      const mode = context.get('mode');

      let result: SecurityResult;

      if (mode === 'quick') {
        // quick-режим: только сканирование staged-diff (быстро)
        const diff = git.getStagedDiff(projectRoot);
        result = runDiffSecurityScan(diff);
      } else {
        // ci/full-режим: полная проверка
        result = runSecurityScan(projectRoot);
      }

      return makeResult(this.name, result, Date.now() - start);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failResult: SecurityResult = {
        auditVulnerabilities: 0,
        auditCritical: 0,
        auditHigh: 0,
        auditModerate: 0,
        auditLow: 0,
        gitleaksFound: 0,
        gitleaksAvailable: false,
        gitleaksUnavailableReason: 'execution_error' as SecurityUnavailableReason,
        gitleaksError: errorMessage,
        auditAdvisories: [],
        gitleaksLeaks: [],
        status: 'error',
        errorMessage,
      };
      return makeResult(this.name, failResult, Date.now() - start);
    }
  }
}