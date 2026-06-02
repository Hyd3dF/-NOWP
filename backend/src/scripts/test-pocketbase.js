const { config, envPath } = require('../config');
const { pocketBase } = require('../pocketbase');

async function main() {
  const result = await pocketBase.testConnection();

  console.log(
    JSON.stringify(
      {
        success: true,
        envPath,
        pocketBaseUrl: config.pocketBase.url,
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error.message,
        status: error.status || 500,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
