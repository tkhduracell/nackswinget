<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { provideClient } from './compsables/client';
import { provideAgenda } from './compsables/agenda';
import { provideNews } from './compsables/news';

const client = provideClient()
provideAgenda(client)
provideNews(client)
</script>

<style>
@keyframes tilt-shaking {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }

  25% {
    transform: translate(5px, 5px) rotate(2deg);
  }

  50% {
    transform: translate(0, 0) rotate(0eg);
  }

  75% {
    transform: translate(-5px, 5px) rotate(-2deg);
  }

  100% {
    transform: translate(0, 0) rotate(0deg);
  }
}

.text-bold {
  font-weight: bold;
}

ion-content.nsw-page {
  --padding-top: 0px; /* needs a unit: Ionic uses it inside calc() */
  --padding-start: 8px;
  --padding-end: 8px;
}

ion-content.nsw-page ion-card {
  margin: 0 0 10px;
  border-radius: 14px;
}

ion-content.nsw-page ion-card-header {
  padding: 12px 12px 4px;
}

ion-content.nsw-page ion-card-content {
  padding: 0 8px 10px;
}

.page-title {
  font-size: 2.75rem;
  font-weight: 800;
  margin: 16px 8px 8px;
}

/* Type scale: title 20 / subtitle 12 / body 15 */
ion-content.nsw-page ion-card-title {
  font-size: 1.25rem;
}

ion-content.nsw-page ion-card-title:not(.card-title-sm) {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.25;
}

ion-content.nsw-page ion-card-subtitle {
  font-size: 0.75rem;
  letter-spacing: 0.02em;
}

ion-content.nsw-page ion-card-content {
  font-size: 0.95rem;
  line-height: 1.4;
}

.card-title-sm {
  font-size: 1.1rem;
}

ion-card.banner {
  box-shadow: none;
  --background: rgba(var(--ion-color-primary-rgb), 0.06);
  border: 1px solid rgba(var(--ion-color-primary-rgb), 0.2);
}
</style>