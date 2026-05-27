import { auth } from "./lib/auth";
import { headers } from "next/headers";

async function main() {
    console.log(auth.api.listUserAccounts.toString());
}
main();
