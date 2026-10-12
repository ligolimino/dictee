(() => {
  "use strict";

  // ================================================================
  // 1. BASIS: vaste gegevens, HTML-elementen en opslag
  // ================================================================

  const DATA = window.LETTERLAB_DATA;
  const app = document.querySelector("#app");
  const APP_TYPE = document.body.dataset.app || "beheer";

  // ================================================================
  // 1b. VOLLEDIGE VERSIE: instructie-audio, afbeelding en woordaudio
  // ================================================================
  // Alleen met "weergave=volledig" in de link verschijnen de instructie,
  // de afbeelding en de luisterknop. Zonder die toevoeging ziet de cursist
  // alleen het dictee (woord, vakjes en toetsenbord), zoals altijd. Zo
  // blijven alle bestaande links in Genially er precies hetzelfde uitzien.

  const PAGE_PARAMETERS = new URLSearchParams(location.search);
  const FULL_VIEW =
    (PAGE_PARAMETERS.get("weergave") || "").trim().toLowerCase() ===
    "volledig";
  const MEDIA = {
    instruction: (PAGE_PARAMETERS.get("instructie") || "").trim(),
    image: (PAGE_PARAMETERS.get("beeld") || "").trim(),
    audio: (PAGE_PARAMETERS.get("audio") || "").trim(),
  };

  // Mappen in deze repository voor eigen bestanden.
  const IMAGE_FOLDER = "assets/afbeeldingen/";
  const INSTRUCTION_FOLDER = "assets/audio/instructies/";
  const WORD_AUDIO_FOLDER = "assets/audio/woorden/";

  // Woordopnames van het klik-klakboekje. Beide tools staan op
  // ligolimino.github.io, dus het dictee kan ze gebruiken zonder kopie.
  const KLIKKLAK_WORD_AUDIO = "../klikklak/assets/audio/woorden/";

  // Bestandstypes die geprobeerd worden als er geen extensie getypt is.
  const IMAGE_EXTENSIONS = [".jpg", ".png", ".webp", ".jpeg"];
  const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav"];

  if (FULL_VIEW) {
    document.body.classList.add("full-view");
  }

  function encodePath(path) {
    return path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  function absoluteUrl(path) {
    return new URL(path, DATA.baseUrl).href;
  }

  // Zet een bestandsnaam of link uit Excel om naar een lijst met adressen
  // die na elkaar geprobeerd worden.
  function mediaCandidates(value, folder, extensions) {
    if (!value) return [];
    const isLink = /^(https?:)?\/\//i.test(value) || /^\.{0,2}\//.test(value);
    if (isLink) return [absoluteUrl(value)];
    if (/\.[a-z0-9]{2,4}$/i.test(value)) {
      return [absoluteUrl(folder + encodePath(value))];
    }
    return extensions.map((extension) =>
      absoluteUrl(folder + encodePath(value + extension)),
    );
  }

  function wordAudioCandidates(word) {
    if (MEDIA.audio.toLowerCase() === "geen") return [];
    if (MEDIA.audio) {
      return mediaCandidates(MEDIA.audio, WORD_AUDIO_FOLDER, AUDIO_EXTENSIONS);
    }
    // Niets opgegeven: eerst een eigen opname in deze repository, daarna
    // de opnames van het klik-klakboekje.
    const file = `${encodeURIComponent(word)}.mp3`;
    const firstLetter = encodeURIComponent(word.charAt(0));
    return [
      absoluteUrl(`${WORD_AUDIO_FOLDER}${firstLetter}/${file}`),
      absoluteUrl(`${KLIKKLAK_WORD_AUDIO}${firstLetter}/${file}`),
      absoluteUrl(`${KLIKKLAK_WORD_AUDIO}nonsens/${file}`),
    ];
  }

  // Zoekt het eerste adres dat echt bestaat. Het resultaat wordt
  // onthouden, zodat een klik meteen kan afspelen.
  const foundMedia = new Map();

  function findFirst(candidates, kind) {
    const key = `${kind}|${candidates.join("|")}`;
    if (foundMedia.has(key)) return foundMedia.get(key);

    const search = new Promise((resolve) => {
      let index = 0;
      const tryNext = () => {
        if (index >= candidates.length) {
          resolve(null);
          return;
        }
        const source = candidates[index];
        index += 1;
        const probe = kind === "image" ? new Image() : new Audio();
        const finish = (ok) => (ok ? resolve(source) : tryNext());
        if (kind === "image") {
          probe.onload = () => finish(true);
          probe.onerror = () => finish(false);
        } else {
          probe.preload = "metadata";
          probe.addEventListener("loadedmetadata", () => finish(true), {
            once: true,
          });
          probe.addEventListener("error", () => finish(false), { once: true });
        }
        probe.src = source;
      };
      tryNext();
    });

    foundMedia.set(key, search);
    return search;
  }

  const STORAGE_PREFIX = DATA.storageNamespace || "letterlab";
  const STORAGE_KEYS = {
    questions: `${STORAGE_PREFIX}-questions-v1`,
    custom: `${STORAGE_PREFIX}-custom-words-v1`,
    exercises: `${STORAGE_PREFIX}-exercises-v1`,
  };

  function loadFromStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function decodeShortExerciseFromUrl() {
    const parameters = new URLSearchParams(location.search);
    const enteredWord = parameters.get("woord")?.trim().toLowerCase();
    const enteredPositions = parameters.get("ontbreekt");

    if (!enteredWord || !enteredPositions) {
      return null;
    }

    const graphemes = tokenize(enteredWord);
    const missing = [
      ...new Set(
        enteredPositions
          .split(",")
          .map((position) => Number.parseInt(position.trim(), 10) - 1)
          .filter(
            (position) =>
              Number.isInteger(position) &&
              position >= 0 &&
              position < graphemes.length,
          ),
      ),
    ];

    if (!graphemes.length || !missing.length) {
      return null;
    }

    const showCopyWord =
      parameters.get("voorbeeld")?.trim().toLowerCase() === "ja";

    return {
      questions: [
        {
          word: graphemes.join(""),
          graphemes,
          missing,
          showCopyWord,
          image: "",
        },
      ],
    };
  }

  function decodeExerciseFromUrl() {
    try {
      const parameters = new URLSearchParams(location.hash.slice(1));
      const encodedExercise = parameters.get("oefening");

      if (!encodedExercise) {
        return decodeShortExerciseFromUrl();
      }

      const base64 = encodedExercise.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0),
      );

      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return decodeShortExerciseFromUrl();
    }
  }

  function decodeExerciseFromUrlString(url) {
    try {
      const exerciseUrl = new URL(url);
      const parameters = new URLSearchParams(exerciseUrl.hash.slice(1));
      const encodedExercise = parameters.get("oefening");
      if (!encodedExercise) return null;

      const base64 = encodedExercise.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0),
      );
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  function encodeExercise(exercise) {
    const bytes = new TextEncoder().encode(JSON.stringify(exercise));
    let binary = "";

    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function makeExerciseUrl(type, settings) {
    const path = DATA.standaloneMode ? "./" : `${type}/`;
    const url = new URL(path, DATA.baseUrl);
    url.hash = `oefening=${encodeExercise(settings)}`;
    return url.href;
  }

  const sharedExercise = decodeExerciseFromUrl();
  const opensSharedDictation = Boolean(sharedExercise?.questions);

  // In state bewaren we alles wat tijdens het gebruik kan veranderen.
  const state = {
    mode:
      APP_TYPE === "dictee" || opensSharedDictation
        ? "dictation"
        : APP_TYPE === "klikklak"
          ? "booklet"
          : "manage",
    questions:
      opensSharedDictation
        ? sharedExercise.questions
        : loadFromStorage(STORAGE_KEYS.questions, DATA.questions),
    customWords: loadFromStorage(STORAGE_KEYS.custom, []),
    currentQuestionIndex: 0,
    typed: "",
    result: "",
    pattern: "MKM",
    learnedGraphemes: new Set(DATA.learnedDefault),
    draftWord: "",
    missingGraphemes: new Set(),
    bookPositions: [0, 0, 0],
    bookGroups:
      APP_TYPE === "klikklak" && sharedExercise?.groups
        ? sharedExercise.groups
        : [DATA.clickBook.begin, DATA.clickBook.kern, DATA.clickBook.einde],
    exerciseName: "",
    clickBookDraft: {
      begin: DATA.clickBook.begin.join(", "),
      kern: DATA.clickBook.kern.join(", "),
      einde: DATA.clickBook.einde.join(", "),
    },
    exercises: loadFromStorage(STORAGE_KEYS.exercises, []),
    editingExerciseId: null,
    publicationMessage: "",
    // Volledige versie: gevonden afbeelding en instructie.
    mediaImage: "",
    instructionFound: false,
  };

  function saveToStorage() {
    localStorage.setItem(
      STORAGE_KEYS.questions,
      JSON.stringify(state.questions),
    );
    localStorage.setItem(
      STORAGE_KEYS.custom,
      JSON.stringify(state.customWords),
    );
    localStorage.setItem(
      STORAGE_KEYS.exercises,
      JSON.stringify(state.exercises),
    );
  }

  // ================================================================
  // 2. KLEINE HULPFUNCTIES
  // ================================================================

  // Voorkomt dat ingevoerde tekst als HTML wordt uitgevoerd.
  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
        })[character],
    );
  }

  function icon(name) {
    return `<svg class="icon" aria-hidden="true">
      <use href="#i-${name}"></use>
    </svg>`;
  }

  function iconButton(name, action, label, extraClass = "") {
    return `<button
      class="icon-btn ${extraClass}"
      data-action="${action}"
      aria-label="${label}"
      title="${label}"
    >${icon(name)}</button>`;
  }

  function header(showSettings = true) {
    if (APP_TYPE === "dictee" || APP_TYPE === "klikklak") {
      return "";
    }
    let leftSide = '<span class="brand">Letterlab</span>';
    if (state.mode !== "home") {
      leftSide = iconButton("back", "home", "Terug");
    }

    const settingsButton = showSettings
      ? iconButton("gear", "manage", "Instellingen")
      : "";

    return `<header class="topbar">
      <div>${leftSide}</div>
      <div class="top-actions">${settingsButton}</div>
    </header>`;
  }

  // ================================================================
  // 3. WOORDEN EN GRAFEMEN
  // ================================================================

  function tokenize(word) {
    const clean = word
      .toLowerCase()
      .trim()
      .replace(/[^a-zà-ÿ]/g, "");
    const out = [];
    let i = 0;
    const compounds = [...DATA.compoundGraphemes].sort(
      (a, b) => b.length - a.length,
    );
    while (i < clean.length) {
      const found = compounds.find((x) => clean.startsWith(x, i));
      out.push(found || clean[i]);
      i += (found || clean[i]).length;
    }
    return out;
  }

  function graphemeType(grapheme) {
    return DATA.vowels.includes(grapheme) ? "K" : "M";
  }

  function patternOf(word) {
    return tokenize(word).map(graphemeType).join("");
  }

  // ================================================================
  // 4. AUDIO (alleen in de volledige versie)
  // ================================================================

  // Houd audiobestanden bij in plaats van bij elke klik een tijdelijk
  // Audio-object te maken. Vooral op smartphones kan zo'n tijdelijk object
  // te laat laden of te vroeg worden opgeruimd, waardoor het begin wegvalt.
  // (Overgenomen uit het uitgebreide dictee, waar dit getest werd.)
  const audioCache = new Map();
  const AUDIO_START_DELAY_MS = 30;
  const AUDIO_OUTPUT_IDLE_MS = 1200;
  const AUDIO_WARMUP_LEAD_MS = 180;
  const AUDIO_WARMUP_TOTAL_MS = 520;
  let activeAudio = null;
  let audioContext = null;
  let lastAudioActivityAt = 0;
  let audioPlaybackRequest = 0;

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function prepareAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  async function warmUpAudioOutputIfNeeded(context) {
    const audioWasRecentlyActive =
      Date.now() - lastAudioActivityAt < AUDIO_OUTPUT_IDLE_MS;

    if (audioWasRecentlyActive) return;

    if (!context) {
      await wait(AUDIO_WARMUP_LEAD_MS);
      return;
    }

    try {
      if (context.state === "suspended") {
        await context.resume();
      }
      // Volledige digitale stilte zet sommige telefoonluidsprekers niet aan.
      // Dit uiterst zachte signaal houdt de audio-uitvoer wakker tot het woord
      // werkelijk begint. Het is normaal niet hoorbaar.
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 80;
      gain.gain.value = 0.001;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + AUDIO_WARMUP_TOTAL_MS / 1000);
      lastAudioActivityAt = Date.now();

      await wait(AUDIO_WARMUP_LEAD_MS);
    } catch {
      await wait(AUDIO_WARMUP_LEAD_MS);
    }
  }

  async function playAudioFile(source, fallback) {
    const context = prepareAudioContext();
    const requestNumber = ++audioPlaybackRequest;

    if (activeAudio && activeAudio !== audioCache.get(source)) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }

    let audio = audioCache.get(source);
    if (!audio) {
      audio = new Audio(source);
      audio.preload = "auto";
      audioCache.set(source, audio);
      audio.load();
    }

    activeAudio = audio;
    audio.pause();
    audio.currentTime = 0;

    try {
      await warmUpAudioOutputIfNeeded(context);
      // Als intussen opnieuw werd geklikt, begint deze oudere aanvraag niet.
      if (requestNumber !== audioPlaybackRequest) return;
      await wait(AUDIO_START_DELAY_MS);
      await audio.play();
      lastAudioActivityAt = Date.now();
      audio.addEventListener(
        "ended",
        () => {
          lastAudioActivityAt = Date.now();
          if (activeAudio === audio) activeAudio = null;
        },
        { once: true },
      );
    } catch {
      if (audioCache.get(source) === audio) {
        audioCache.delete(source);
      }
      if (fallback) fallback();
    }
  }

  // Noodoplossing als er geen opname van het woord bestaat.
  function speakWithBrowserVoice(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "nl-BE";
    utterance.rate = 0.72;
    speechSynthesis.speak(utterance);
  }

  function speakWord(word) {
    // Volgorde: opgegeven audio, eigen opname, opname van het
    // klik-klakboekje en pas daarna de browserstem.
    findFirst(wordAudioCandidates(word), "audio").then((source) => {
      if (source) {
        playAudioFile(source, () => speakWithBrowserVoice(word));
      } else {
        speakWithBrowserVoice(word);
      }
    });
  }

  function playInstruction() {
    const candidates = mediaCandidates(
      MEDIA.instruction,
      INSTRUCTION_FOLDER,
      AUDIO_EXTENSIONS,
    );
    findFirst(candidates, "audio").then((source) => {
      if (source) playAudioFile(source);
    });
  }

  // Zoekt bij de start de afbeelding en de instructie op. Ontbreekt een
  // bestand, dan verdwijnt het bijbehorende onderdeel gewoon.
  function prepareFullView() {
    if (!FULL_VIEW) return;

    const imageCandidates = mediaCandidates(
      MEDIA.image,
      IMAGE_FOLDER,
      IMAGE_EXTENSIONS,
    );
    if (imageCandidates.length) {
      findFirst(imageCandidates, "image").then((source) => {
        state.mediaImage = source || "";
        if (state.mode === "dictation") dictation();
      });
    }

    const instructionCandidates = mediaCandidates(
      MEDIA.instruction,
      INSTRUCTION_FOLDER,
      AUDIO_EXTENSIONS,
    );
    if (instructionCandidates.length) {
      findFirst(instructionCandidates, "audio").then((source) => {
        state.instructionFound = Boolean(source);
        if (state.mode === "dictation") dictation();
      });
    }
  }

  function instructionBar() {
    if (!FULL_VIEW || !state.instructionFound) return "";
    return `<div class="instruction-bar">
      <button class="play-instruction" data-action="speak-instruction" aria-label="Luister naar de opdracht">
        ${icon("play")}
      </button>
    </div>`;
  }

  function getCurrentQuestion() {
    return state.questions[state.currentQuestionIndex] || DATA.questions[0];
  }

  function getExpectedAnswer(question = getCurrentQuestion()) {
    return question.missing.map((index) => question.graphemes[index]).join("");
  }

  // ================================================================
  // 5. SCHERMEN OPBOUWEN
  // ================================================================

  function home() {
    app.innerHTML = `${header()}<section class="screen"><div class="home-grid">
      <button class="mode-card" data-action="dictation" aria-label="Dictee">${icon("keyboard")}</button>
      <button class="mode-card" data-action="booklet" aria-label="Klik-klakboekje">${icon("book")}</button>
    </div></section>`;
  }
  function dictation() {
    if (!state.questions.length) {
      state.mode = "home";
      home();
      return;
    }
    if (state.currentQuestionIndex >= state.questions.length) {
      state.currentQuestionIndex = state.questions.length - 1;
    }
    const question = getCurrentQuestion();
    // Nieuwe links bewaren de keuze per vraag. De tweede waarde houdt
    // eerder gemaakte links met één algemene keuze werkend.
    const showCopyWord =
      question.showCopyWord ?? (sharedExercise?.showCopyWord === true);
    const missingOrder = question.missing;
    const typedChunks = {};

    let offset = 0;

    missingOrder.forEach((index) => {
      const graphemeLength = question.graphemes[index].length;
      typedChunks[index] = state.typed.slice(offset, offset + graphemeLength);
      offset += graphemeLength;
    });

    const slots = question.graphemes
      .map((grapheme, index) => {
        if (!question.missing.includes(index)) {
          return `<span class="slot">${escapeHtml(grapheme)}</span>`;
        }

        const minimumWidth = Math.max(48, grapheme.length * 42);
        const typedChunk = typedChunks[index] || " ";

        return `<span
          class="slot missing ${state.result}"
          style="min-width:${minimumWidth}px"
        >${escapeHtml(typedChunk)}</span>`;
      })
      .join("");

    let feedback = '<div class="feedback"></div>';
    if (state.result === "good") {
      const nextButton =
        state.currentQuestionIndex < state.questions.length - 1
          ? iconButton("next", "next-question", "Volgende", "good")
          : "";
      // Ook na een juist antwoord kan de cursist het woord opnieuw proberen.
      feedback = `<div class="feedback good">
        ${icon("check")}
        ${iconButton("retry", "retry", "Opnieuw", "again")}
        ${nextButton}
      </div>`;
    }
    if (state.result === "wrong") {
      feedback = `<div class="feedback bad">
        ${icon("close")}
        ${iconButton("retry", "retry", "Opnieuw", "bad")}
      </div>`;
    }

    const keyboardRows = DATA.keyboard
      .map(
        (row) =>
          `<div class="key-row">
            ${row
              .map(
                (letter) =>
                  `<button class="key" data-key="${letter}">${letter}</button>`,
              )
              .join("")}
          </div>`,
      )
      .join("");

    // Volledige versie: instructie, luisterknop en afbeelding.
    const listenButton =
      FULL_VIEW && MEDIA.audio.toLowerCase() !== "geen"
        ? `<button class="listen" data-action="speak-word" aria-label="Luister">
            ${icon("speaker")}
          </button>`
        : "";
    const imageSource = FULL_VIEW ? question.image || state.mediaImage : "";
    const image = imageSource
      ? `<img class="dictation-image" src="${escapeHtml(imageSource)}" alt="">`
      : "";

    app.innerHTML = `${header()}
      <section class="screen dictation">
        ${FULL_VIEW ? `<div class="dictation-media">${instructionBar()}${listenButton}${image}</div>` : ""}
        ${showCopyWord ? `<div class="copy-word">${escapeHtml(question.word)}</div>` : ""}
        <div class="word-slots">${slots}</div>
        ${feedback}
        <div class="keyboard">
          ${keyboardRows}
          <div class="key-row">
            <button class="key wide" data-action="erase" aria-label="Wis">
              ${icon("back")}
            </button>
          </div>
        </div>
      </section>`;
  }


  function booklet() {
    const groups = state.bookGroups;

    const parts = groups.map((group, index) => {
      const position = state.bookPositions[index] % group.length;
      return group[position];
    });

    const word = parts.join("");

    const columns = groups
      .map((group, index) => {
        const value = parts[index];

        return `<div class="book-col">
          <button class="tiny-btn" data-book="${index}" data-delta="-1" aria-label="Vorige">
            ${icon("up")}
          </button>
          <span class="sound-card">
            ${escapeHtml(value)}
          </span>
          <button class="tiny-btn" data-book="${index}" data-delta="1" aria-label="Volgende">
            ${icon("down")}
          </button>
        </div>`;
      })
      .join("");

    app.innerHTML = `${header()}
      <section class="screen booklet">
        <div class="book-word">
          <span>${escapeHtml(word)}</span>
        </div>
        <div class="book-columns">${columns}</div>
      </section>`;
  }
  function manualPanel() {
    const graphemes = tokenize(state.draftWord);
    const choices = graphemes
      .map(
        (grapheme, index) =>
          `<button class="chip missing-choice ${state.missingGraphemes.has(index) ? "active" : ""}" data-missing="${index}">${escapeHtml(grapheme)}</button>`,
      )
      .join("");

    const graphemePicker = graphemes.length
      ? `<p class="help">Tik op wat de cursist moet typen.</p>
         <div class="chips">${choices}</div>
         <p>
           <button class="action" data-action="add-manual">
             ${icon("plus")} Toevoegen
           </button>
         </p>`
      : "";

    return `<section class="panel">
      <h2>Zelf een dicteewoord toevoegen</h2>
      <div class="field">
        <label for="draft">Woord</label>
        <input
          id="draft"
          class="text-input"
          value="${escapeHtml(state.draftWord)}"
          autocomplete="off"
          autocapitalize="none"
        >
      </div>
      ${graphemePicker}
    </section>`;
  }

  function generatorPanel() {
    const availableWords = [
      ...new Set([...DATA.wordBank, ...state.customWords]),
    ]
      .filter(
        (word) =>
          patternOf(word) === state.pattern &&
          tokenize(word).every((grapheme) =>
            state.learnedGraphemes.has(grapheme),
          ),
      )
      .slice(0, 80);

    const suggestion =
      availableWords
        .map((word) => {
          return `<button
            class="suggestion"
            data-suggest="${escapeHtml(word)}"
          >
            ${icon("plus")}
            ${escapeHtml(word)}
          </button>`;
        })
        .join("") || `<div class="empty">Geen woorden met deze keuze.</div>`;

    const patternButtons = DATA.patterns
      .map(
        (pattern) =>
          `<button class="chip ${pattern === state.pattern ? "active" : ""}" data-pattern="${pattern}">${pattern}</button>`,
      )
      .join("");

    const graphemeButtons = DATA.learnable
      .map(
        (grapheme) =>
          `<button class="chip ${state.learnedGraphemes.has(grapheme) ? "active" : ""}" data-learned="${grapheme}">${grapheme}</button>`,
      )
      .join("");

    return `<section class="panel">
      <h2>Woorden uit de databank</h2>
      <div class="field">
        <label>Woordvorm</label>
        <div class="chips">${patternButtons}</div>
      </div>
      <div class="field">
        <label>Geleerde letters en klanken</label>
        <div class="chips">${graphemeButtons}</div>
      </div>
      <div class="suggestions">${suggestion}</div>
    </section>`;
  }
  function seriesPanel() {
    const list = state.questions
      .map(
        (question, index) =>
          `<div class="series-item series-item-editable">
            <div class="series-order">
              ${iconButton("up", `move-up:${index}`, `Verplaats ${question.word} omhoog`)}
              ${iconButton("down", `move-down:${index}`, `Verplaats ${question.word} omlaag`)}
            </div>
            <div class="series-question">
              <span class="series-word">${escapeHtml(question.word)}</span>
              <div class="series-missing" aria-label="Ontbrekende letters kiezen">
                ${question.graphemes
                  .map(
                    (grapheme, graphemeIndex) =>
                      `<button class="chip missing-choice ${question.missing.includes(graphemeIndex) ? "active" : ""}"
                        data-series-missing="${index}:${graphemeIndex}">${escapeHtml(grapheme)}</button>`,
                  )
                  .join("")}
              </div>
              <label class="question-option">
                <input type="checkbox" data-question-example="${index}"
                  ${question.showCopyWord ? "checked" : ""}>
                Toon voorbeeldwoord
              </label>
            </div>
            <span class="series-pattern">${patternOf(question.word)}</span>
            ${iconButton("close", `remove:${index}`, `Verwijder ${question.word}`)}
          </div>`,
      )
      .join("");

    return `<section class="panel">
      <h2>Huidige dicteereeks</h2>
      <div class="series">
        ${list || '<div class="empty">Nog geen woorden.</div>'}
      </div>
    </section>`;
  }

  function splitGraphemeList(value) {
    return value
      .toLowerCase()
      .split(",")
      .map((grapheme) => grapheme.trim())
      .filter(Boolean);
  }

  function publishPanel() {
    const editingText = state.editingExerciseId
      ? `<div class="edit-notice">Je bewerkt een opgeslagen dictee. Bij opnieuw klaarzetten krijg je een nieuwe link. Vervang daarna de oude link in Genially. De oude link blijft werken.</div>`
      : "";
    const publicationMessage = state.publicationMessage
      ? `<div class="publication-message">${escapeHtml(state.publicationMessage)}</div>`
      : "";

    return `<section class="panel">
      <h2>Oefening klaarzetten</h2>
      ${editingText}
      ${publicationMessage}
      <div class="field">
        <label for="exercise-name">Naam in de leerlijn</label>
        <input
          id="exercise-name"
          class="text-input"
          value="${escapeHtml(state.exerciseName)}"
          placeholder="bijvoorbeeld 1.3 – kip"
        >
      </div>
      <div class="publish-actions">
        <button class="action" data-action="save-dictation">
          ${icon("keyboard")} Dictee klaarzetten
        </button>
      </div>
    </section>`;
  }

  function clickBookPanel() {
    return `<section class="panel">
      <h2>Klik-klakboekje instellen</h2>
      <p class="help">Scheid letters en clusters met komma's.</p>
      <div class="field">
        <label for="book-begin">Vooraan</label>
        <input id="book-begin" class="text-input" value="${escapeHtml(state.clickBookDraft.begin)}">
      </div>
      <div class="field">
        <label for="book-kern">Midden</label>
        <input id="book-kern" class="text-input" value="${escapeHtml(state.clickBookDraft.kern)}">
      </div>
      <div class="field">
        <label for="book-einde">Achteraan</label>
        <input id="book-einde" class="text-input" value="${escapeHtml(state.clickBookDraft.einde)}">
      </div>
      <button class="action" data-action="save-clickbook">
        ${icon("book")} Klik-klakboekje klaarzetten
      </button>
    </section>`;
  }

  function savedExercisesPanel() {
    const exerciseList = state.exercises
      .filter((exercise) => exercise.type === "dictee")
      .map(
        (exercise) => `<div class="exercise-item">
          <div class="exercise-info">
            <strong>${escapeHtml(exercise.name)}</strong>
            <span>${exercise.type === "dictee" ? "Dictee" : "Klik-klak"}</span>
          </div>
          <a class="action secondary" href="${escapeHtml(exercise.url)}" target="_blank">Open</a>
          <button class="action secondary" data-copy-url="${escapeHtml(exercise.url)}">Kopieer link</button>
          ${exercise.type === "dictee" ? `<button class="action secondary" data-edit-exercise="${exercise.id}">Bewerk</button>` : ""}
          <button class="icon-btn" data-delete-exercise="${exercise.id}" aria-label="Verwijder">
            ${icon("close")}
          </button>
        </div>`,
      )
      .join("");

    return `<section class="panel">
      <h2>Klaargezette oefeningen</h2>
      <div class="exercise-list">
        ${exerciseList || '<div class="empty">Nog geen aparte oefeningen.</div>'}
      </div>
    </section>`;
  }

  function manage() {
    app.innerHTML = `${header(false)}
      <main class="teacher">
        <h1>Instellingen eenvoudig dictee</h1>
        ${publishPanel()}
        ${manualPanel()}
        ${generatorPanel()}
        ${seriesPanel()}
        ${savedExercisesPanel()}
      </main>`;
  }
  function render() {
    const screens = {
      home: home,
      dictation: dictation,
      booklet: booklet,
      manage: manage,
    };

    const selectedScreen = screens[state.mode] || home;
    selectedScreen();
  }

  // ================================================================
  // 6. WOORDEN TOEVOEGEN
  // ================================================================

  function addWord(word, missing = null) {
    const graphemes = tokenize(word);
    if (!graphemes.length) return;
    const indexes = missing?.length ? missing : [...graphemes.keys()];
    // Elke toevoeging is een aparte vraag, ook als hetzelfde woord al voorkomt.
    state.questions.push({
      word,
      graphemes,
      missing: indexes,
      showCopyWord: false,
    });
    const isNewCustomWord =
      !DATA.wordBank.includes(word) && !state.customWords.includes(word);

    if (isNewCustomWord) {
      state.customWords.push(word);
    }

    saveToStorage();
  }

  function moveQuestion(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.questions.length) return;

    const [question] = state.questions.splice(index, 1);
    state.questions.splice(newIndex, 0, question);
    saveToStorage();
    manage();
  }

  function saveExercise(type) {
    const name = state.exerciseName.trim() || `Nieuwe ${type}`;
    let settings;

    if (type === "dictee") {
      settings = {
        type: "dictee",
        name: name,
        questions: state.questions.map((question) => ({
          word: question.word,
          graphemes: [...question.graphemes],
          missing: [...question.missing],
          showCopyWord: question.showCopyWord === true,
        })),
      };
    } else {
      const groups = [
        splitGraphemeList(state.clickBookDraft.begin),
        splitGraphemeList(state.clickBookDraft.kern),
        splitGraphemeList(state.clickBookDraft.einde),
      ];

      if (groups.some((group) => group.length === 0)) {
        alert("Vul voor elke plaats minstens één letter of klank in.");
        return;
      }

      settings = {
        type: "klikklak",
        name: name,
        groups: groups,
      };
    }

    const url = makeExerciseUrl(type, settings);
    state.exercises.push({
      id: Date.now(),
      name: name,
      type: type,
      url: url,
      settings: settings,
    });

    if (state.editingExerciseId) {
      state.publicationMessage =
        "Nieuwe link gemaakt. Vervang de oude link in Genially; de oude link blijft werken.";
    } else {
      state.publicationMessage = "Oefening en link zijn opgeslagen.";
    }
    state.editingExerciseId = null;
    state.exerciseName = "";
    saveToStorage();
    manage();
  }

  // ================================================================
  // 7. GEBEURTENISSEN: TYPEN, KIEZEN EN KLIKKEN
  // ================================================================

  app.addEventListener("input", (e) => {
    if (e.target.id === "draft") {
      // Onthoud waar de cursor stond voordat het scherm opnieuw wordt opgebouwd.
      // Zonder deze stap springt de cursor terug naar het begin en worden nieuwe
      // letters telkens vóór de bestaande tekst geplaatst.
      const cursorPosition = e.target.selectionStart ?? e.target.value.length;

      state.draftWord = e.target.value.toLowerCase();
      state.missingGraphemes.clear();
      manage();

      const refreshedInput = document.querySelector("#draft");
      refreshedInput?.focus();
      refreshedInput?.setSelectionRange(cursorPosition, cursorPosition);
    }

    if (e.target.id === "exercise-name") {
      state.exerciseName = e.target.value;
    }

    if (e.target.dataset.questionExample !== undefined) {
      const question = state.questions[Number(e.target.dataset.questionExample)];
      if (question) {
        question.showCopyWord = e.target.checked;
        saveToStorage();
      }
    }

    if (e.target.id === "book-begin") {
      state.clickBookDraft.begin = e.target.value;
    }

    if (e.target.id === "book-kern") {
      state.clickBookDraft.kern = e.target.value;
    }

    if (e.target.id === "book-einde") {
      state.clickBookDraft.einde = e.target.value;
    }
  });
  app.addEventListener("click", (e) => {
    const target = e.target.closest(
      "button,[data-action],[data-key],[data-book],[data-missing],[data-series-missing],[data-pattern],[data-learned],[data-suggest],[data-copy-url],[data-delete-exercise],[data-edit-exercise]",
    );
    if (!target) return;

    if (target.dataset.copyUrl) {
      navigator.clipboard
        .writeText(target.dataset.copyUrl)
        .then(() => {
          target.textContent = "Gekopieerd";
        })
        .catch(() => {
          prompt("Kopieer deze link:", target.dataset.copyUrl);
        });
      return;
    }

    if (target.dataset.deleteExercise) {
      const id = Number(target.dataset.deleteExercise);
      state.exercises = state.exercises.filter(
        (exercise) => exercise.id !== id,
      );
      saveToStorage();
      manage();
      return;
    }
    if (target.dataset.editExercise) {
      const id = Number(target.dataset.editExercise);
      const exercise = state.exercises.find((item) => item.id === id);
      if (!exercise) return;

      // Oudere opgeslagen oefeningen hadden nog geen apart settings-veld.
      const settings =
        exercise.settings || decodeExerciseFromUrlString(exercise.url);
      if (!settings?.questions) {
        alert("Deze oefening kon niet worden ingelezen.");
        return;
      }

      state.questions = settings.questions.map((question) => ({
        word: question.word,
        graphemes: [...question.graphemes],
        missing: [...question.missing],
        showCopyWord:
          question.showCopyWord ?? (settings.showCopyWord === true),
      }));
      state.exerciseName = exercise.name;
      state.editingExerciseId = id;
      state.publicationMessage = "";
      saveToStorage();
      manage();
      return;
    }
    if (target.dataset.key && !state.result) {
      state.typed += target.dataset.key;

      const expectedAnswer = getExpectedAnswer();
      const answerIsComplete = state.typed.length >= expectedAnswer.length;

      if (answerIsComplete) {
        const answerIsCorrect = state.typed === expectedAnswer;
        state.result = answerIsCorrect ? "good" : "wrong";
      }

      dictation();
      return;
    }
    if (target.dataset.book !== undefined) {
      const columnIndex = Number(target.dataset.book);
      const groups = state.bookGroups;
      const group = groups[columnIndex];
      const direction = Number(target.dataset.delta);

      state.bookPositions[columnIndex] =
        (state.bookPositions[columnIndex] + direction + group.length) %
        group.length;

      booklet();
      return;
    }
    if (target.dataset.missing !== undefined) {
      const index = Number(target.dataset.missing);

      if (state.missingGraphemes.has(index)) {
        state.missingGraphemes.delete(index);
      } else {
        state.missingGraphemes.add(index);
      }

      manage();
      return;
    }
    if (target.dataset.seriesMissing) {
      const [questionIndex, graphemeIndex] = target.dataset.seriesMissing
        .split(":")
        .map(Number);
      const question = state.questions[questionIndex];
      if (!question) return;

      if (question.missing.includes(graphemeIndex)) {
        // Er moet altijd minstens één deel ontbreken.
        if (question.missing.length > 1) {
          question.missing = question.missing.filter(
            (index) => index !== graphemeIndex,
          );
        }
      } else {
        question.missing = [...question.missing, graphemeIndex].sort(
          (a, b) => a - b,
        );
      }
      saveToStorage();
      manage();
      return;
    }
    if (target.dataset.pattern) {
      state.pattern = target.dataset.pattern;
      manage();
      return;
    }
    if (target.dataset.learned) {
      const grapheme = target.dataset.learned;

      if (state.learnedGraphemes.has(grapheme)) {
        state.learnedGraphemes.delete(grapheme);
      } else {
        state.learnedGraphemes.add(grapheme);
      }

      manage();
      return;
    }
    if (target.dataset.suggest) {
      addWord(target.dataset.suggest);
      manage();
      return;
    }
    const action = target.dataset.action;
    if (action === "home") {
      state.mode = "home";
      render();
    } else if (action === "manage") {
      state.mode = "manage";
      render();
    } else if (action === "dictation") {
      state.mode = "dictation";
      state.currentQuestionIndex = 0;
      state.typed = "";
      state.result = "";
      render();
    } else if (action === "booklet") {
      state.mode = "booklet";
      render();
    } else if (action === "speak-word") {
      speakWord(getCurrentQuestion().word);
    } else if (action === "speak-instruction") {
      playInstruction();
    } else if (action === "erase" && !state.result) {
      state.typed = state.typed.slice(0, -1);
      dictation();
    } else if (action === "retry") {
      state.typed = "";
      state.result = "";
      dictation();
    } else if (action === "next-question") {
      if (state.currentQuestionIndex >= state.questions.length - 1) return;
      state.currentQuestionIndex += 1;
      state.typed = "";
      state.result = "";
      dictation();
    } else if (action === "restart-dictation") {
      state.currentQuestionIndex = 0;
      state.typed = "";
      state.result = "";
      dictation();
    } else if (action === "add-manual") {
      const wordIsFilledIn = Boolean(state.draftWord);
      const missingPartIsSelected = state.missingGraphemes.size > 0;

      if (wordIsFilledIn && missingPartIsSelected) {
        addWord(
          state.draftWord,
          [...state.missingGraphemes].sort((a, b) => a - b),
        );
        state.draftWord = "";
        state.missingGraphemes.clear();
        manage();
      }
    } else if (action?.startsWith("remove:")) {
      state.questions.splice(Number(action.split(":")[1]), 1);
      state.currentQuestionIndex = 0;
      saveToStorage();
      manage();
    } else if (action?.startsWith("move-up:")) {
      moveQuestion(Number(action.split(":")[1]), -1);
    } else if (action?.startsWith("move-down:")) {
      moveQuestion(Number(action.split(":")[1]), 1);
    } else if (action === "save-dictation") {
      saveExercise("dictee");
    } else if (action === "save-clickbook") {
      saveExercise("klikklak");
    }
  });

  // Start de app voor de eerste keer op.
  render();
  prepareFullView();
})();
