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
}

.page-title {
  font-size: 2.25rem;
  font-weight: 800;
  margin: 20px 16px 4px;
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