import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "../.env";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
