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

      const prevScore = await db.getPreviousQScore();
      const checksCount = await db.getChecksCount();

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
      const currentQScore = (scoresResult?.data as Scores | null)?.qScore ?? null;

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
        // +1 потому что текущая проверка ещё не записана в БД
        checksCount: checksCount + 1,
      };

      // Сохраняем историю в контекст через служебное поле
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