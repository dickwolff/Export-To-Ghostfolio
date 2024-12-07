<template>
    <div class="max-w-2xl mx-auto p-6 space-y-8">
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">Import Broker Data</h2>
        </template>
  
        <div class="space-y-6">
          <!-- Broker Selection -->
          <USelect
            v-model="selectedBroker"
            :options="brokers"
            placeholder="Select your broker"
            searchable
            class="w-full"
          />
  
          <!-- File Input -->
          <div v-if="selectedBroker" class="space-y-2">
            <UInput type="file" 
              v-model="selectedFile"
              :accept="['text/csv', 'application/vnd.ms-excel']"
              label="Upload your broker file"
              @change="handleFileChange"
            />
          </div>

          
          <!-- Ghostfolio settings -->
          <div v-if="selectedFile" class="text-center space-y-4">
                <h3 class="text-xl font-semibold text-left">Ghostfolio Settings</h3>
                <div class="flex space-x-4 mx-1 my-2">
                    <UCheckbox v-model="GHOSTFOLIO_VALIDATE" name="GHOSTFOLIO_VALIDATE" label="Validate" />
                    <UCheckbox v-model="GHOSTFOLIO_IMPORT" name="GHOSTFOLIO_IMPORT" label="Import" />
                    <UCheckbox v-model="GHOSTFOLIO_UPDATE_CASH" name="GHOSTFOLIO_UPDATE_CASH" label="Update cash" />
                </div>
                <UInput v-model="GHOSTFOLIO_ACCOUNT_ID" placeholder="GHOSTFOLIO_ACCOUNT_ID" icon="i-heroicons-account" class="my-4" required="true" />
                <UInput v-if="GHOSTFOLIO_IMPORT" v-model="GHOSTFOLIO_URL" placeholder="GHOSTFOLIO_URL" icon="i-heroicons-envelope" class="my-4" />
                <UInput v-if="GHOSTFOLIO_IMPORT" v-model="GHOSTFOLIO_SECRET" placeholder="GHOSTFOLIO_SECRET" icon="i-heroicons-envelope" class="my-4" />
          </div>
  
          <!-- Process Button -->
          <UButton
            v-if="selectedFile"
            :loading="isProcessing"
            @click="processFile"
            color="primary"
            block
          >
            Process
          </UButton>
  
          <!-- Processing Animation -->
          <div v-if="isProcessing" class="text-center space-y-4">
            <UProgress animation="carousel" class="w-full" />
            <p class="text-gray-600 animate-pulse">{{ processingMessage }}</p>
          </div>
  
          <!-- Action Buttons -->
          <div v-if="isProcessed" class="flex space-x-4">
            <div class="w-full">
            <UButton
                block
              icon="i-heroicon-arrow-down-tray"
              color="primary"
              @click="downloadResults"
            >
              Download Results
            </UButton>
            </div>
            
            <div class="w-full" v-if="GHOSTFOLIO_URL">
                <UButton
                    block
                    icon="i-heroicon-ghost"
                    color="gray"
                    @click="connectToGhostfolio"
                    :loading="isConnecting"
                    :to="GHOSTFOLIO_URL"
                    target="_blank"
                >
                    Connect to Ghostfolio
                </UButton>
            </div>
          </div>

        </div>
      </UCard>
    </div>
    <div class="max-w-2xl mx-auto p-6 space-y-8">
      <UCard>
        <div class="flex space-x-4 justify-between">
            <h2 class="text-xl font-semibold">Server log</h2>
            <UCheckbox v-model="showServerLogs"/>
        </div>
        <UTextarea v-if="showServerLogs" disabled v-model="logs" :rows="30" :maxrows="100" />
      </UCard>
    </div>
    <UNotifications />
  </template>
  
<script setup lang="ts">
import { nextTick } from 'vue'


const toast = useToast()

  const brokers = [
    { label: 'Bv',            value: 'bv'},
    { label: 'Bitvavo',       value: 'bitvavo'},
    { label: 'Bux',           value: 'bux'},
    { label: 'Degiro-v1',     value: 'degiro-v1'},
    { label: 'Degiro',        value: 'degiro'},
    { label: 'Degiro-v3',     value: 'degiro-v3'},
    { label: 'Etoro',         value: 'etoro'},
    { label: 'Fp',            value: 'fp'},
    { label: 'Finpension',    value: 'finpension'},
    { label: 'Ft',            value: 'ft'},
    { label: 'Freetrade',     value: 'freetrade'},
    { label: 'Ibkr',          value: 'ibkr'},
    { label: 'Investimental', value: 'investimental'},
    { label: 'Parqet',        value: 'parqet'},
    { label: 'Rabobank',      value: 'rabobank'},
    { label: 'Revolut',       value: 'revolut'},
    { label: 'Schwab',        value: 'schwab'},
    { label: 'Sq',            value: 'sq'},
    { label: 'Swissquote',    value: 'swissquote'},
    { label: 'T212',          value: 't212'},
    { label: 'Trading212',    value: 'trading212'},
    { label: 'Xtb',           value: 'xtb'},
  ]


  
  const selectedBroker = ref(null)
  const selectedFile = ref(null)
  const isProcessing = ref(false)
  const isProcessed = ref(false)
  const isConnecting = ref(false)
  const showSuccess = ref(false)
  const showGhostFolioConfig = ref(false)

  
  const config = useRuntimeConfig()

  console.log(config);
  console.log(config.public);
  
    const GHOSTFOLIO_VALIDATE = ref(!!config.public.GHOSTFOLIO_VALIDATE || false);
    const GHOSTFOLIO_IMPORT = ref(!!config.public.GHOSTFOLIO_IMPORT || false);
    const GHOSTFOLIO_UPDATE_CASH = ref(!!config.public.GHOSTFOLIO_UPDATE_CASH || false);
    const GHOSTFOLIO_ACCOUNT_ID = ref(config.public.GHOSTFOLIO_ACCOUNT_ID || "");
    const GHOSTFOLIO_URL = ref(config.public.GHOSTFOLIO_URL || "");
    const GHOSTFOLIO_SECRET = ref(config.public.GHOSTFOLIO_SECRET || "");

  const serverUrl = config.public.serverUrl;

    let logs = ref("");
  
    const showServerLogs = ref(config.public.isDev || false);

  const processingMessages = [
    'Processing your data...',
    'Checking transaction logs...',
    'Connecting to stock markets...',
    'Mining some Bitcoin to make this work...',
    'Analyzing market patterns...'
  ]
  
  const processingMessage = ref(processingMessages[0])
  let messageInterval
  
  const handleFileChange = (files) => {
    if (files.length > 0) {
      selectedFile.value = files[0]
    }
  }

  async function downloadFile(url, fileName) {
  try {
    // Fetch the file from the URL
    const response = await fetch(url);

    // Check if the response is successful
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    // Get the file blob
    const blob = await response.blob();

    // Create a temporary link element
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); // Create a URL for the blob
    link.download = fileName || 'download'; // Specify the download name
    document.body.appendChild(link); // Append the link to the DOM

    // Trigger the download
    link.click();

    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href); // Release memory
  } catch (error) {
    console.error('Error downloading file:', error);

  }
}

  let lastResponse;
  
  const processFile = async () => {
    isProcessing.value = true
    let messageIndex = 0
    
    messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % processingMessages.length
      processingMessage.value = processingMessages[messageIndex]
    }, 2000)
  
    // Simulate processing
    //await new Promise(resolve => setTimeout(resolve, 8000))

    // MAIN LOGIC:
    // TODO make post

    // create a fetch to same urt with post and send the file
    

    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('broker', selectedBroker.value);
    formData.append('GHOSTFOLIO_VALIDATE', GHOSTFOLIO_VALIDATE.value);
    formData.append('GHOSTFOLIO_IMPORT', GHOSTFOLIO_IMPORT.value);
    formData.append('GHOSTFOLIO_UPDATE_CASH', GHOSTFOLIO_UPDATE_CASH.value);
    formData.append('GHOSTFOLIO_ACCOUNT_ID', GHOSTFOLIO_ACCOUNT_ID.value);
    formData.append('GHOSTFOLIO_URL', GHOSTFOLIO_URL.value);
    formData.append('GHOSTFOLIO_SECRET', GHOSTFOLIO_SECRET.value);
    
    try {
        const response = await fetch(serverUrl + 'upload', {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            throw new Error(`Failed to process file: ${lastResponse.statusText}`);
        }

        lastResponse = await response.json();
        
        isProcessed.value = true
    } catch (error) {
        nextTick(() => isProcessing.value = false);
        console.error('Error processing file:', error);
        isProcessed.value = false
        toast.add({ title: 'Error on the process, please check logs.' })
    }
    
    isProcessing.value = false
    clearInterval(messageInterval)

  }
  
  const downloadResults = () => {
    // download the file from lastResponse.url
    downloadFile(serverUrl + lastResponse.url, lastResponse.url.replaceAll("/", "_").replaceAll("\\", "_"));
  }


// Conectar al WebSocket en el navegador
const socket = new WebSocket(serverUrl.replace('http', 'ws'));

// Abrir conexión
socket.addEventListener('open', () => {
  console.log('Conexión WebSocket abierta.');
});


function formatDateTime() {
      const now = new Date();
      const padZero = (num) => (num < 10 ? `0${num}` : num);
      const formattedDateTime = `${padZero(now.getDate())}/${padZero(now.getMonth() + 1)}/${now.getFullYear()} ${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}`;
      return formattedDateTime;
    }

// Escuchar mensajes del servidor
socket.addEventListener('message', (event) => {
    const formattedDateTime = formatDateTime(); 
    const textToAdd = `${formattedDateTime} - ${event.data} \n`;

    console.log(textToAdd);
    nextTick(() => {
        logs.value += textToAdd;
        const textarea = document.querySelector("textarea");
        if (textarea) {
            textarea.scrollTop = textarea.scrollHeight;
        }
    });
});

// Manejar errores
socket.addEventListener('error', (error) => {
  console.error('Error en WebSocket:', error);
});

// Manejar cierre de conexión
socket.addEventListener('close', () => {
  console.log('Conexión WebSocket cerrada.');
});
  
  
  // Cleanup
  onBeforeUnmount(() => {
    if (messageInterval) {
      clearInterval(messageInterval)
    }
  })
  </script>
  
  <style scoped>
  .success-animation {
    animation: fadeIn 0.5s ease-in;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  </style>