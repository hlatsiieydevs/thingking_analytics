<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// State management
const wsStatus = ref('DISCONNECTED');
const activeNodeId = ref('node_retail_01');
const livePeopleCount = ref(0);
const cpuLoad = ref(0);
const ramUsage = ref(0);
const fps = ref(0);
const recentDwellLogs = ref([]);
const recentTrafficLogs = ref([]);
const liveMessageLog = ref([]);

let socket = null;

const connectWebSocket = () => {
  wsStatus.value = 'CONNECTING';
  
  // Connect to UI backend websocket server
  // In docker compose, this runs on port 5000
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.hostname}:5000`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    wsStatus.value = 'CONNECTED';
    console.log('[Dashboard UI] WebSocket Connected');
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[Dashboard UI] Message received:', message);
      
      // Save to logs
      liveMessageLog.value.unshift({
        timestamp: new Date().toLocaleTimeString(),
        topic: message.topic || 'unknown',
        data: message.data
      });
      if (liveMessageLog.value.length > 50) liveMessageLog.value.pop();

      // Process event types
      if (message.type === 'telemetry_event') {
        const telemetry = message.data;
        activeNodeId.value = telemetry.node_id;

        // 1. System Metrics
        if (telemetry.metrics) {
          livePeopleCount.value = telemetry.metrics.live_people_count;
          cpuLoad.value = telemetry.metrics.cpu_load_percent;
          ramUsage.value = telemetry.metrics.ram_usage_percent;
          fps.value = telemetry.metrics.current_fps;
        }
        
        // 2. Dwell Time
        if (telemetry.dwell_time_sec !== undefined) {
          recentDwellLogs.value.unshift(telemetry);
          if (recentDwellLogs.value.length > 10) recentDwellLogs.value.pop();
        }

        // 3. Traffic Flow
        if (telemetry.flow_records !== undefined) {
          recentTrafficLogs.value.unshift(...telemetry.flow_records.map(r => ({
            ...r,
            node_id: telemetry.node_id,
            timestamp: telemetry.timestamp
          })));
          if (recentTrafficLogs.value.length > 20) recentTrafficLogs.value.splice(20);
        }
      }
    } catch (e) {
      console.error('[Dashboard UI] Failed to process message:', e);
    }
  };

  socket.onclose = () => {
    wsStatus.value = 'DISCONNECTED';
    console.log('[Dashboard UI] WebSocket Disconnected. Reconnecting in 5s...');
    setTimeout(connectWebSocket, 5000);
  };

  socket.onerror = (err) => {
    console.error('[Dashboard UI] WebSocket Error:', err);
  };
};

// Fetch historical records
const fetchHistory = async () => {
  const host = `${window.location.protocol}//${window.location.hostname}:5000`;
  try {
    const dwellRes = await fetch(`${host}/api/v1/analytics/dwell`);
    if (dwellRes.ok) {
      const data = await dwellRes.json();
      recentDwellLogs.value = data;
    }

    const trafficRes = await fetch(`${host}/api/v1/analytics/traffic`);
    if (trafficRes.ok) {
      const data = await trafficRes.json();
      recentTrafficLogs.value = data;
    }
  } catch (error) {
    console.warn('[Dashboard UI] Fetch history failed (UI backend may be offline):', error.message);
  }
};

onMounted(() => {
  connectWebSocket();
  fetchHistory();
});

onUnmounted(() => {
  if (socket) socket.close();
});
</script>

<template>
  <div class="min-h-screen bg-[#0d0f12] text-[#f3f4f6] font-sans antialiased">
    <!-- Header -->
    <header class="border-b border-[#1f2937] bg-[#111827]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <span class="font-bold text-white text-lg">T</span>
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Thingking Analytics
          </h1>
          <p class="text-xs text-gray-500">Central Edge CV Server</p>
        </div>
      </div>
      
      <!-- WebSocket status indicator -->
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold backdrop-blur"
           :class="{
             'bg-emerald-500/10 border-emerald-500/20 text-emerald-400': wsStatus === 'CONNECTED',
             'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse': wsStatus === 'CONNECTING',
             'bg-rose-500/10 border-rose-500/20 text-rose-400': wsStatus === 'DISCONNECTED'
           }">
        <span class="w-2.5 h-2.5 rounded-full"
              :class="{
                'bg-emerald-400': wsStatus === 'CONNECTED',
                'bg-amber-400': wsStatus === 'CONNECTING',
                'bg-rose-400': wsStatus === 'DISCONNECTED'
              }"></span>
        {{ wsStatus }}
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- Left Column: Metrics & Live stats -->
      <div class="lg:col-span-2 space-y-8">
        
        <!-- Live Node Info -->
        <div class="bg-[#111827]/50 border border-[#1f2937] rounded-2xl p-6 backdrop-blur">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h2 class="text-lg font-bold text-white">Live Node Telemetry</h2>
              <p class="text-sm text-gray-400">Real-time status feed from active node</p>
            </div>
            <span class="text-xs px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md font-mono">
              ID: {{ activeNodeId }}
            </span>
          </div>

          <!-- Live Metrics Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="bg-[#182235]/40 border border-[#1f2937] rounded-xl p-4 text-center">
              <span class="text-xs text-gray-400 block mb-1">Live Occupancy</span>
              <span class="text-3xl font-extrabold text-indigo-400">{{ livePeopleCount }}</span>
              <span class="text-[10px] text-gray-500 block mt-1">people in frame</span>
            </div>

            <div class="bg-[#182235]/40 border border-[#1f2937] rounded-xl p-4 text-center">
              <span class="text-xs text-gray-400 block mb-1">CPU Load</span>
              <span class="text-3xl font-extrabold text-purple-400">{{ cpuLoad }}%</span>
              <span class="text-[10px] text-gray-500 block mt-1">edge system load</span>
            </div>

            <div class="bg-[#182235]/40 border border-[#1f2937] rounded-xl p-4 text-center">
              <span class="text-xs text-gray-400 block mb-1">RAM Usage</span>
              <span class="text-3xl font-extrabold text-pink-400">{{ ramUsage }}%</span>
              <span class="text-[10px] text-gray-500 block mt-1">volatile memory</span>
            </div>

            <div class="bg-[#182235]/40 border border-[#1f2937] rounded-xl p-4 text-center">
              <span class="text-xs text-gray-400 block mb-1">Inference FPS</span>
              <span class="text-3xl font-extrabold text-emerald-400">{{ fps }}</span>
              <span class="text-[10px] text-gray-500 block mt-1">frames per second</span>
            </div>
          </div>
        </div>

        <!-- Dwell Time Logs -->
        <div class="bg-[#111827]/50 border border-[#1f2937] rounded-2xl p-6 backdrop-blur">
          <h2 class="text-lg font-bold text-white mb-4">Dwell Time Events</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm border-collapse">
              <thead>
                <tr class="border-b border-[#1f2937] text-gray-400">
                  <th class="py-3 px-4 font-semibold">Event ID</th>
                  <th class="py-3 px-4 font-semibold">Track ID</th>
                  <th class="py-3 px-4 font-semibold">Zone</th>
                  <th class="py-3 px-4 font-semibold">Dwell Duration</th>
                  <th class="py-3 px-4 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="recentDwellLogs.length === 0" class="text-gray-500">
                  <td colspan="5" class="py-6 text-center">Waiting for live dwell events...</td>
                </tr>
                <tr v-for="log in recentDwellLogs" :key="log.id || log.event_id" class="border-b border-[#1f2937]/50 hover:bg-[#182235]/20 transition-colors">
                  <td class="py-3 px-4 font-mono text-xs text-indigo-300">{{ log.event_id || log.eventId }}</td>
                  <td class="py-3 px-4 font-mono">{{ log.track_id || log.trackId }}</td>
                  <td class="py-3 px-4">Zone {{ log.zone_id || log.zoneId }}</td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      {{ (log.dwell_time_sec || log.dwellTimeSec).toFixed(1) }}s
                    </span>
                  </td>
                  <td class="py-3 px-4 text-xs text-gray-400">
                    {{ new Date((log.timestamp * 1000) || log.timestamp).toLocaleTimeString() }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Right Column: Traffic Flow & System logs -->
      <div class="space-y-8">
        
        <!-- Live Pathflow / Trajectories -->
        <div class="bg-[#111827]/50 border border-[#1f2937] rounded-2xl p-6 backdrop-blur">
          <h2 class="text-lg font-bold text-white mb-2">Live Path Coordinates</h2>
          <p class="text-sm text-gray-400 mb-4">Traffic flow coordinate streams from edge camera</p>
          
          <div class="h-48 bg-[#090b0e] border border-[#1f2937] rounded-xl relative overflow-hidden flex items-center justify-center">
            <!-- Simulated grid map overlay -->
            <div class="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:16px_16px] opacity-10"></div>
            
            <!-- Live visual coordinate dots -->
            <div v-for="(record, idx) in recentTrafficLogs.slice(0, 10)" :key="idx"
                 class="absolute w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-500 border border-white/20 animate-ping shadow-lg shadow-pink-500/50"
                 :style="{
                   left: `${(record.x % 1) * 80 + 10}%`,
                   top: `${(record.y % 1) * 80 + 10}%`
                 }">
            </div>
            
            <div class="text-xs text-gray-500 z-10 font-mono text-center">
              <span class="block font-bold text-gray-400">Calibration Canvas</span>
              <span>Visualizing bounding box centroids</span>
            </div>
          </div>
          
          <!-- Latest Coordinates Table -->
          <div class="mt-4 max-h-48 overflow-y-auto">
            <div v-for="(record, idx) in recentTrafficLogs.slice(0, 5)" :key="idx"
                 class="flex justify-between items-center text-xs py-2 border-b border-[#1f2937]/50">
              <span class="text-gray-400 font-mono">Track #{{ record.track_id || record.trackId }}</span>
              <span class="font-mono text-pink-400">X: {{ (record.x).toFixed(1) }} Y: {{ (record.y).toFixed(1) }}</span>
            </div>
          </div>
        </div>

        <!-- Raw WebSocket Message Feed -->
        <div class="bg-[#111827]/50 border border-[#1f2937] rounded-2xl p-6 backdrop-blur">
          <h2 class="text-lg font-bold text-white mb-4">WebSocket raw console</h2>
          <div class="h-64 overflow-y-auto bg-[#090b0e] border border-[#1f2937] rounded-xl p-4 font-mono text-[10px] space-y-2 text-emerald-400">
            <div v-if="liveMessageLog.length === 0" class="text-gray-500 text-center py-16">
              Console idle. Waiting for connection or events...
            </div>
            <div v-for="(msg, idx) in liveMessageLog" :key="idx" class="border-b border-[#1f2937]/20 pb-2">
              <div class="flex justify-between text-gray-500">
                <span>[{{ msg.timestamp }}]</span>
                <span class="text-indigo-400 font-semibold">{{ msg.topic }}</span>
              </div>
              <pre class="whitespace-pre-wrap mt-1 text-emerald-500">{{ JSON.stringify(msg.data, null, 2) }}</pre>
            </div>
          </div>
        </div>

      </div>

    </main>
  </div>
</template>
