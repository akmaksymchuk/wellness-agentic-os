import { runHealthAgent } from "../src/harness/runHealthAgent";

const task =
  process.argv[2] ??
  "Составь план на неделю: больше сна, прогулки и меньше сладкого вечером.";

console.log("Задача:", task);
console.log("---");

runHealthAgent(task, {
  onRound: (round, review) => {
    console.log(`\n[раунд ${round}] ${review.verdict} (score ${review.score})`);
    if (review.issues.length) {
      console.log("issues:", review.issues.join("; "));
    }
  },
})
  .then((result) => {
    console.log("\n=== Готово ===");
    console.log("rounds:", result.rounds);
    console.log("verdict:", result.review.verdict);
    if (result.plan) {
      console.log("\nПлан:\n", result.plan);
    }
  })
  .catch((error) => {
    console.error("\nОшибка:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
