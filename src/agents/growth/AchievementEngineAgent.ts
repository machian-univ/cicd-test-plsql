import type { Agent } from '../base/Agent.js';
import { makeResult } from '../base/Agent.js';
import type { RunContext } from '../../core/RunContext.js';
import type { Achievement, ProgressResult, AgentResult } from '../../core/types.js';

export class AchievementEngineAgent implements Agent<Achievement[]> {
  readonly name = 'AchievementEngineAgent';

  async run(context: RunContext): Promise<AgentResult<Achievement[]>> {
    const start = Date.now();

    // ЗАГЛУШКА: логика достижений скоро
    const progressResult = context.get('progressResult');
    const progress = progressResult?.data as ProgressResult | null;

    const achievements: Achievement[] = [];

    if (progress?.checksCount === 1) {
      achievements.push({
        type: 'first_check',
        label: 'Первая проверка',
        description: 'Вы запустили Pulsqual впервые. Начало пути!',
      });
    }

    if (progress?.trend === 'up' && progress.delta && progress.delta > 5) {
      achievements.push({
        type: 'quality_boost',
        label: 'Качество растёт',
        description: `Q-Score вырос на ${progress.delta.toFixed(1)} пункта`,
      });
    }

    return makeResult(this.name, achievements, Date.now() - start);
  }
}