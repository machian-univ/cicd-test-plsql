import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type { ProgressResult, Scores, AgentResult } from '../../core/types.js';
import { Database } from '../../db/Database.js';
import type { QScoreHistoryPoint } from '../../core/RunContext.js';
import path from 'path';

export class ProgressTrackerAgent implements Agent<ProgressResult> {
  readonly name = 'ProgressTrackerAgent';

  async run(context: RunContext): Promise<AgentResult<ProgressResult>> {
    const start = Date.now();

    try {
      const config = context.get('config');
      const outputDir = path.join(context.get('projectRoot'), config.paths.output);
      const db = new Database(outputDir);

      const branch = context.get('branch');
      const prevScore = await db.getPreviousQScore();
      const checksCount = await db.getChecksCount();
      const branchStats = await db.getCheckStatsForBranch(branch ?? null);

      // Загружаем историю для графика (последние 20 проверок)
      const historyRaw = await db.getQScoreHistory(20);
      const qScoreHistory: QScoreHistoryPoint[] = historyRaw.map(r => ({
        qScore: r.q_score,
        createdAt: r.created_at,
        commitHash: r.commit_hash,
        branch: r.branch,
      }));

      db.close();

      const scoresResult = context.get('scores');
      const scoresData = scoresResult?.data as Scores | null;
      const currentQScore = scoresData?.qScore ?? null;
      const currentGatePassed = scoresData?.gatePassed ?? false;

      let delta: number | null = null;
      let trend: ProgressResult['trend'] = 'unknown';

      if (prevScore !== null && currentQScore !== null) {
        delta = parseFloat((currentQScore - prevScore).toFixed(1));
        trend = delta > 1 ? 'up' : delta < -1 ? 'down' : 'stable';
      }

      const result: ProgressResult = {
        previousQScore: prevScore,
        delta,
        trend,
        checksCount: checksCount + 1,
        ciCheckStats: context.get('mode') === 'ci'
          ? {
              total: branchStats.total + 1,
              passed: branchStats.passed + (currentGatePassed ? 1 : 0),
              failed: branchStats.failed + (currentGatePassed ? 0 : 1),
            }
          : undefined,
      };

      (result as any).__qScoreHistory = qScoreHistory;

      return makeResult(this.name, result, Date.now() - start);
    } catch (_err) {
      return makeResult(
        this.name,
        { previousQScore: null, delta: null, trend: 'unknown', checksCount: 1 },
        Date.now() - start,
      );
    }
  }
}