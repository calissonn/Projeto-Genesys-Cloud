/** Sobe o servidor falso da Anthropic (npm run mock:anthropic) para testar a redação por IA sem custo. */
import { startAnthropicMock } from './anthropicMock.js';

startAnthropicMock(Number(process.env.MOCK_ANTHROPIC_PORT ?? 9091)).then(({ url }) => {
  console.log(`API Anthropic FALSA em ${url}`);
  console.log(`Configure o backend com: AI_ENABLED=true ANTHROPIC_API_KEY=teste ANTHROPIC_BASE_URL=${url}`);
});
