import { auth } from "./lib/auth";

async function main() {
   // Let's see what methods are on auth
   console.log(Object.keys(auth));
}
main();
