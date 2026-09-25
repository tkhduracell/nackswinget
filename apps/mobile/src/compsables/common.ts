import { ref } from 'vue';

export function useAppMode() {
    const mode = import.meta.env.MODE as 'production' | 'development' | 'staging'
    return { mode, isDev: mode === 'development', isProd: mode === 'production', isStaging: mode === 'staging' }
}

export function useToast(def?: string, timeout = 5000) {
    const toasted = ref<string | null>(def ?? null)

    const timer = ref<NodeJS.Timeout | null>(null)

    function toast(id: string) {
        if (timer.value) clearTimeout(timer.value);

        toasted.value = id;
        timer.value = setTimeout(() => {
            if (toasted.value !== id) return;
            toasted.value = null;
        }, timeout)
    }

    return { toast, toasted }
}
export function useRapidClicks(count: number, windowMs: number, onTrigger: () => void, now: () => number = Date.now) {
    let clicks: number[] = []

    function click() {
        const t = now()
        clicks = [...clicks.filter(c => t - c < windowMs), t]
        if (clicks.length >= count) {
            clicks = []
            onTrigger()
        }
    }

    return { click }
}
