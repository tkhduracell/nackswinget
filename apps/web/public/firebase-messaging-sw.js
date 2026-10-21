importScripts('https://www.gstatic.com/firebasejs/7.14.3/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/7.14.3/firebase-messaging.js');

const app = firebase.initializeApp({
    apiKey: "AIzaSyBJ_cRfI7tvVZ_xlIk9QqF6eN29YD6xOAk",
    authDomain: "nackswinget-af7ef.firebaseapp.com",
    projectId: "nackswinget-af7ef",
    storageBucket: "nackswinget-af7ef.appspot.com",
    messagingSenderId: "560237127162",
    appId: "1:560237127162:web:2e12c34e9e8fa521997043"
});

const messaging = firebase.messaging();


messaging.setBackgroundMessageHandler((msg) => {
  console.log('onBackgroundMessage', msg)
})

console.log('Service worker started!')

self.addEventListener('push', event => {
  console.debug('New event:', event.data.json())
  const { notification } = event.data.json()
  console.log('New notification', notification)
  const title = notification.title;
  const options = { body: notification.body, image: notification.image };
  event.waitUntil(self.registration.showNotification(title, options));
});

/*

// https://firebasestorage.googleapis.com/v0/b/nackswinget-af7ef.appspot.com/o/FCMImages%2FLogga_Nackswinget_hq.png?alt=media&token=134aa7d4-9e3d-4a3d-9d4b-7d5f081322b9

// import { initializeApp } from "firebase/app";
// import { getMessaging } from "firebase/messaging";

// import { getMessaging } from "firebase/messaging/sw";
// import { onBackgroundMessage } from "firebase/messaging/sw";

importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyBJ_cRfI7tvVZ_xlIk9QqF6eN29YD6xOAk",
    authDomain: "nackswinget-af7ef.firebaseapp.com",
    projectId: "nackswinget-af7ef",
    storageBucket: "nackswinget-af7ef.appspot.com",
    messagingSenderId: "560237127162",
    appId: "1:560237127162:web:2e12c34e9e8fa521997043"
};

const app = firebase.initializeApp(firebaseConfig);

const messaging = firebase.getMessaging(app);

firebase.onBackgroundMessage(messaging, (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = 'Background Message Title';
  const notificationOptions = {
    body: 'Background Message body.',
    icon: '/firebase-logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

*/