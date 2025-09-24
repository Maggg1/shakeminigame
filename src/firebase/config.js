// Firebase initialization for Email Link authentication
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
		apiKey: "AIzaSyCF4grWdwnpHuSma9RVMKxcIBd2IpUxyaE",
		authDomain: "mini-game-7c14b.firebaseapp.com",
		projectId: "mini-game-7c14b",
		storageBucket: "mini-game-7c14b.firebasestorage.app",
		messagingSenderId: "678507372131",
		appId: "1:678507372131:web:aeb6ecb08d948c44716256"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };