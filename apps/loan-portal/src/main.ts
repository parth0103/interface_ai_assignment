import { createLoanPortalApp } from "./server.js";

const port = Number(process.env.PORT ?? "3000");
const app = createLoanPortalApp();

app.listen(port, () => {
  console.log(`Loan Servicing Portal listening on http://localhost:${port}`);
});
