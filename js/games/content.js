// Built-in game content for Kazakh, Russian and English (works without Gemini and without a network
// for the text part). Other language pairs get their content from Gemini through the backend.
// Every row is aligned: [kk, ru, en].

export const BUILTIN_LANGS = ["kk", "ru", "en"];
const IDX = { kk: 0, ru: 1, en: 2 };
export const hasBuiltin = (know, learn) => know !== learn && know in IDX && learn in IDX;

const WORDS = {
  easy: [
    ["су", "вода", "water"], ["нан", "хлеб", "bread"], ["алма", "яблоко", "apple"], ["үй", "дом", "house"],
    ["мысық", "кошка", "cat"], ["ит", "собака", "dog"], ["кітап", "книга", "book"], ["мектеп", "школа", "school"],
    ["ана", "мать", "mother"], ["әке", "отец", "father"], ["күн", "солнце", "sun"], ["ай", "луна", "moon"],
    ["қала", "город", "city"], ["көше", "улица", "street"], ["есік", "дверь", "door"], ["терезе", "окно", "window"],
    ["үстел", "стол", "table"], ["орындық", "стул", "chair"], ["қалам", "ручка", "pen"], ["дос", "друг", "friend"],
    ["сүт", "молоко", "milk"], ["шай", "чай", "tea"], ["ет", "мясо", "meat"], ["балық", "рыба", "fish"],
    ["жұмыс", "работа", "work"], ["ақша", "деньги", "money"], ["уақыт", "время", "time"], ["бүгін", "сегодня", "today"],
    ["ертең", "завтра", "tomorrow"], ["кеше", "вчера", "yesterday"], ["үлкен", "большой", "big"], ["кішкентай", "маленький", "small"],
    ["жақсы", "хороший", "good"], ["жаман", "плохой", "bad"], ["қызыл", "красный", "red"], ["ақ", "белый", "white"],
    ["қара", "чёрный", "black"], ["бір", "один", "one"], ["екі", "два", "two"], ["үш", "три", "three"]
  ],
  medium: [
    ["дүкен", "магазин", "shop"], ["баға", "цена", "price"], ["ауа райы", "погода", "weather"], ["сұрақ", "вопрос", "question"],
    ["жауап", "ответ", "answer"], ["сапар", "поездка", "trip"], ["жол", "дорога", "road"], ["тамақ", "еда", "food"],
    ["дәрі", "лекарство", "medicine"], ["дәрігер", "врач", "doctor"], ["аурухана", "больница", "hospital"], ["бөлме", "комната", "room"],
    ["кілт", "ключ", "key"], ["киім", "одежда", "clothes"], ["аяқ киім", "обувь", "shoes"], ["сөмке", "сумка", "bag"],
    ["тіл", "язык", "language"], ["сөз", "слово", "word"], ["сабақ", "урок", "lesson"], ["мұғалім", "учитель", "teacher"],
    ["отбасы", "семья", "family"], ["бала", "ребёнок", "child"], ["ағаш", "дерево", "tree"], ["тау", "гора", "mountain"],
    ["өзен", "река", "river"], ["көл", "озеро", "lake"], ["теңіз", "море", "sea"], ["қыс", "зима", "winter"],
    ["жаз", "лето", "summer"], ["көктем", "весна", "spring"], ["күз", "осень", "autumn"], ["таңғы ас", "завтрак", "breakfast"],
    ["кешкі ас", "ужин", "dinner"], ["жылдам", "быстрый", "fast"], ["баяу", "медленный", "slow"], ["қымбат", "дорогой", "expensive"],
    ["арзан", "дешёвый", "cheap"], ["әуежай", "аэропорт", "airport"], ["пойыз", "поезд", "train"], ["бекет", "остановка", "stop"]
  ],
  hard: [
    ["мүмкіндік", "возможность", "opportunity"], ["тәжірибе", "опыт", "experience"], ["жауапкершілік", "ответственность", "responsibility"],
    ["келісім", "соглашение", "agreement"], ["шешім", "решение", "decision"], ["даму", "развитие", "development"],
    ["табысты", "успешный", "successful"], ["қауіпсіздік", "безопасность", "safety"], ["денсаулық", "здоровье", "health"],
    ["білім", "знание", "knowledge"], ["ғылым", "наука", "science"], ["қоршаған орта", "окружающая среда", "environment"],
    ["тәуелсіздік", "независимость", "independence"], ["мақсат", "цель", "goal"], ["нәтиже", "результат", "result"],
    ["мәселе", "проблема", "problem"], ["сапа", "качество", "quality"], ["ой", "мысль", "thought"],
    ["сезім", "чувство", "feeling"], ["сенім", "доверие", "trust"], ["шыдамдылық", "терпение", "patience"],
    ["батылдық", "смелость", "courage"], ["құрмет", "уважение", "respect"], ["еңбекқор", "трудолюбивый", "hardworking"],
    ["ұқыпты", "аккуратный", "tidy"], ["кездейсоқ", "случайный", "random"], ["міндетті", "обязательный", "mandatory"],
    ["бағыт", "направление", "direction"], ["салт-дәстүр", "традиция", "tradition"], ["ұрпақ", "поколение", "generation"],
    ["мұра", "наследие", "heritage"], ["ынтымақ", "сотрудничество", "cooperation"]
  ]
};

const PHRASES = {
  easy: [
    ["Сәлеметсіз бе!", "Здравствуйте!", "Hello!"],
    ["Менің атым Айгүл.", "Меня зовут Айгуль.", "My name is Aigul."],
    ["Бұл менің кітабым.", "Это моя книга.", "This is my book."],
    ["Мен шай ішемін.", "Я пью чай.", "I drink tea."],
    ["Бүгін ауа райы жақсы.", "Сегодня хорошая погода.", "The weather is nice today."],
    ["Рахмет, сау болыңыз!", "Спасибо, до свидания!", "Thank you, goodbye!"],
    ["Сіз қайдансыз?", "Откуда вы?", "Where are you from?"],
    ["Мен Алматыда тұрамын.", "Я живу в Алматы.", "I live in Almaty."],
    ["Бұл қанша тұрады?", "Сколько это стоит?", "How much is this?"],
    ["Менің досым бар.", "У меня есть друг.", "I have a friend."],
    ["Маған су беріңізші.", "Дайте мне, пожалуйста, воды.", "Please give me some water."],
    ["Мен түсінбедім.", "Я не понял.", "I didn't understand."]
  ],
  medium: [
    ["Мен ертең таңертең Астанаға ұшамын.", "Завтра утром я лечу в Астану.", "Tomorrow morning I am flying to Astana."],
    ["Жақын жерде дәріхана бар ма?", "Здесь поблизости есть аптека?", "Is there a pharmacy nearby?"],
    ["Маған терезе жанындағы орын керек.", "Мне нужно место у окна.", "I need a window seat."],
    ["Біз демалыс күндері тауға барамыз.", "В выходные мы едем в горы.", "We are going to the mountains at the weekend."],
    ["Кешіріңіз, вокзалға қалай баруға болады?", "Извините, как пройти к вокзалу?", "Excuse me, how do I get to the station?"],
    ["Мен қазақ тілін үйреніп жүрмін.", "Я изучаю казахский язык.", "I am learning Kazakh."],
    ["Бұл мейрамхана өте танымал.", "Этот ресторан очень популярный.", "This restaurant is very popular."],
    ["Есепшотты әкеліңізші.", "Принесите, пожалуйста, счёт.", "Could you bring the bill, please?"],
    ["Телефонымның заряды бітіп қалды.", "У меня сел телефон.", "My phone battery is dead."],
    ["Сабақ сағат тоғызда басталады.", "Урок начинается в девять часов.", "The lesson starts at nine o'clock."],
    ["Ол күнде таңертең жүгіреді.", "Он бегает каждое утро.", "He runs every morning."],
    ["Бізге екі адамға үстел керек.", "Нам нужен столик на двоих.", "We need a table for two."]
  ],
  hard: [
    ["Егер уақытым болса, мен сізге міндетті түрде көмектесер едім.", "Если бы у меня было время, я бы обязательно вам помог.", "If I had time, I would definitely help you."],
    ["Бұл шешім біздің компанияның болашағына үлкен әсер етеді.", "Это решение сильно повлияет на будущее нашей компании.", "This decision will greatly affect the future of our company."],
    ["Жиналыс күтпеген жерден келесі аптаға ауыстырылды.", "Собрание неожиданно перенесли на следующую неделю.", "The meeting was unexpectedly moved to next week."],
    ["Денсаулықты сақтау үшін дұрыс тамақтану маңызды.", "Чтобы сохранить здоровье, важно правильно питаться.", "Eating properly is important for staying healthy."],
    ["Тәжірибесінің аздығына қарамастан, ол жұмысқа қабылданды.", "Несмотря на небольшой опыт, его приняли на работу.", "Despite his limited experience, he was hired."],
    ["Қоршаған ортаны қорғау — әр адамның міндеті.", "Защита окружающей среды — обязанность каждого человека.", "Protecting the environment is everyone's duty."],
    ["Тапсырманы мерзімінде аяқтау үшін бізге көбірек адам керек.", "Чтобы закончить задание в срок, нам нужно больше людей.", "We need more people to finish the task on time."],
    ["Кітап оқу ойлау қабілетін дамытады.", "Чтение книг развивает мышление.", "Reading books develops thinking."],
    ["Саяхаттау басқа мәдениеттерді түсінуге көмектеседі.", "Путешествия помогают понять другие культуры.", "Travelling helps you understand other cultures."],
    ["Біз бұл мәселені бірлесіп шешуге тиіспіз.", "Мы должны решить эту проблему вместе.", "We have to solve this problem together."]
  ]
};

const QUESTIONS = {
  easy: [
    ["Сіздің атыңыз кім?", "Как вас зовут?", "What is your name?"],
    ["Сіз қайда тұрасыз?", "Где вы живёте?", "Where do you live?"],
    ["Сізге қандай тамақ ұнайды?", "Какая еда вам нравится?", "What food do you like?"],
    ["Сіздің отбасыңыз үлкен бе?", "У вас большая семья?", "Is your family big?"],
    ["Бүгін ауа райы қандай?", "Какая сегодня погода?", "What is the weather like today?"],
    ["Сізге қандай түс ұнайды?", "Какой цвет вам нравится?", "What colour do you like?"],
    ["Сізде үй жануары бар ма?", "У вас есть домашнее животное?", "Do you have a pet?"],
    ["Сіз таңертең не ішесіз?", "Что вы пьёте утром?", "What do you drink in the morning?"]
  ],
  medium: [
    ["Демалыс күндері немен айналысасыз?", "Чем вы занимаетесь в выходные?", "What do you do at the weekend?"],
    ["Сіз қай елге барғыңыз келеді?", "В какую страну вы хотите поехать?", "Which country would you like to visit?"],
    ["Сіздің сүйікті кітабыңыз қандай?", "Какая ваша любимая книга?", "What is your favourite book?"],
    ["Сіз жұмысқа немен барасыз?", "На чём вы ездите на работу?", "How do you get to work?"],
    ["Кеше кешке не істедіңіз?", "Что вы делали вчера вечером?", "What did you do yesterday evening?"],
    ["Сіз неге тіл үйреніп жүрсіз?", "Почему вы изучаете языки?", "Why are you learning languages?"],
    ["Сізге қай жыл мезгілі ұнайды және неге?", "Какое время года вам нравится и почему?", "Which season do you like and why?"]
  ],
  hard: [
    ["Технология біздің өмірімізді қалай өзгертті?", "Как технологии изменили нашу жизнь?", "How has technology changed our lives?"],
    ["Жақсы дос қандай болу керек деп ойлайсыз?", "Каким, по-вашему, должен быть хороший друг?", "What do you think a good friend should be like?"],
    ["Бес жылдан кейін өзіңізді қайда көресіз?", "Где вы видите себя через пять лет?", "Where do you see yourself in five years?"],
    ["Үлкен қалада тұрудың артықшылығы мен кемшілігі қандай?", "Каковы плюсы и минусы жизни в большом городе?", "What are the pros and cons of living in a big city?"],
    ["Сіздің өміріңізге кім көбірек әсер етті?", "Кто больше всего повлиял на вашу жизнь?", "Who has influenced your life the most?"],
    ["Онлайн оқудың қандай пайдасы бар?", "Какая польза от онлайн-обучения?", "What are the benefits of online learning?"]
  ]
};

// answers: first is the main form, the rest are also accepted
const RIDDLES = [
  { a: [["мысық"], ["кошка", "кот"], ["cat"]], c: [
    ["Бұл — үй жануары.", "Это домашнее животное.", "It is a pet."],
    ["Ол сүт ішкенді және тышқан аулағанды жақсы көреді.", "Оно любит пить молоко и ловить мышей.", "It likes milk and hunting mice."],
    ["Ол «мияу» дейді.", "Оно говорит «мяу».", "It says “meow”."]] },
  { a: [["күн"], ["солнце"], ["sun"]], c: [
    ["Ол аспанда.", "Оно на небе.", "It is in the sky."],
    ["Ол бізге жарық пен жылу береді.", "Оно даёт нам свет и тепло.", "It gives us light and warmth."],
    ["Ол таңертең шығып, кешке батады.", "Оно встаёт утром и садится вечером.", "It rises in the morning and sets in the evening."]] },
  { a: [["кітап"], ["книга"], ["book"]], c: [
    ["Оның мұқабасы мен көп беті бар.", "У неё есть обложка и много страниц.", "It has a cover and many pages."],
    ["Оны оқиды.", "Её читают.", "People read it."],
    ["Онда ертегілер мен әңгімелер жазылады.", "В ней пишут сказки и рассказы.", "Stories and fairy tales are written in it."]] },
  { a: [["су"], ["вода"], ["water"]], c: [
    ["Онсыз ешкім өмір сүре алмайды.", "Без неё никто не может жить.", "Nobody can live without it."],
    ["Ол өзенде, көлде және теңізде бар.", "Она есть в реке, в озере и в море.", "It is in rivers, lakes and seas."],
    ["Оны шөлдегенде ішеміз.", "Её пьют, когда хочется пить.", "We drink it when we are thirsty."]] },
  { a: [["алма"], ["яблоко"], ["apple"]], c: [
    ["Бұл — жеміс.", "Это фрукт.", "It is a fruit."],
    ["Ол қызыл, жасыл немесе сары болады.", "Оно бывает красным, зелёным или жёлтым.", "It can be red, green or yellow."],
    ["Ол ағашта өседі, дәмі тәтті немесе қышқыл.", "Оно растёт на дереве и бывает сладким или кислым.", "It grows on a tree and tastes sweet or sour."]] },
  { a: [["мұғалім"], ["учитель", "учительница", "преподаватель"], ["teacher"]], c: [
    ["Бұл — мамандық.", "Это профессия.", "It is a job."],
    ["Бұл адам мектепте жұмыс істейді.", "Этот человек работает в школе.", "This person works at a school."],
    ["Ол балаларға сабақ береді.", "Он даёт детям уроки.", "This person gives lessons to children."]] },
  { a: [["қыс"], ["зима"], ["winter"]], c: [
    ["Бұл — жыл мезгілі.", "Это время года.", "It is a season."],
    ["Бұл кезде күн суық болады.", "В это время холодно.", "It is cold at this time."],
    ["Бұл кезде қар жауады.", "В это время идёт снег.", "It snows at this time."]] },
  { a: [["нан"], ["хлеб"], ["bread"]], c: [
    ["Бұл — тағам.", "Это еда.", "It is food."],
    ["Оны ұн мен судан пісіреді.", "Его пекут из муки и воды.", "It is baked from flour and water."],
    ["Қазақтар оны ешқашан жерге тастамайды.", "Казахи никогда не бросают его на землю.", "Kazakhs never throw it on the ground."]] },
  { a: [["қолшатыр"], ["зонт", "зонтик"], ["umbrella"]], c: [
    ["Оны көбіне сөмкеде алып жүреді.", "Его часто носят в сумке.", "People often carry it in a bag."],
    ["Оны жаңбыр жауғанда ашады.", "Его открывают, когда идёт дождь.", "You open it when it rains."],
    ["Ол басымызды жаңбыр мен күннен қорғайды.", "Он защищает голову от дождя и солнца.", "It protects your head from rain and sun."]] },
  { a: [["жылқы", "ат"], ["лошадь", "конь"], ["horse"]], c: [
    ["Бұл — үлкен жануар.", "Это большое животное.", "It is a big animal."],
    ["Оған ерте заманнан бері мінеді.", "На ней ездят верхом с древних времён.", "People have ridden it since ancient times."],
    ["Оның сүтінен қымыз жасайды.", "Из её молока делают кумыс.", "Kumis is made from its milk."]] },
  { a: [["әуежай"], ["аэропорт"], ["airport"]], c: [
    ["Бұл — үлкен ғимарат.", "Это большое здание.", "It is a big building."],
    ["Мұнда адамдар жүкпен келеді.", "Сюда приходят люди с багажом.", "People come here with luggage."],
    ["Мұнан ұшақтар ұшып шығады.", "Отсюда улетают самолёты.", "Planes take off from here."]] },
  { a: [["дәрігер"], ["врач", "доктор"], ["doctor"]], c: [
    ["Бұл — мамандық.", "Это профессия.", "It is a job."],
    ["Бұл адам ақ халат киеді.", "Этот человек носит белый халат.", "This person wears a white coat."],
    ["Ауырғанда біз оған барамыз.", "Когда мы болеем, мы идём к нему.", "We go to this person when we are ill."]] }
];

// Practice phrases. Russian and English ones are traditional tongue twisters (folk, public domain).
// The Kazakh ones are short practice phrases written for this app around sounds that are hard for learners
// (қ, ғ, ң, ө, ү, ұ, і), so the UI calls them «Қиын дыбыстар», not traditional жаңылтпаш.
const TWISTERS = {
  kk: [
    { t: "Қара қарға қыраттан қарап отыр.", f: "Қ, Р дыбыстары", tr: { ru: "Чёрная ворона смотрит с холма.", en: "A black crow is watching from the hill." } },
    { t: "Ақ көбелек көк шөпке қонды.", f: "К, Ө дыбыстары", tr: { ru: "Белая бабочка села на зелёную траву.", en: "A white butterfly landed on the green grass." } },
    { t: "Үш үйрек үлкен көлде жүзеді.", f: "Ү дыбысы", tr: { ru: "Три утки плавают в большом озере.", en: "Three ducks swim in a big lake." } },
    { t: "Ұлан ұшатын ұшақты ұзақ күтті.", f: "Ұ дыбысы", tr: { ru: "Улан долго ждал самолёт.", en: "Ulan waited a long time for the plane." } },
    { t: "Ғалым ағай бағына ағаш екті.", f: "Ғ дыбысы", tr: { ru: "Дядя Галым посадил дерево в саду.", en: "Uncle Galym planted a tree in his garden." } },
    { t: "Сеңгір таудың етегінде жаңа ауыл тұр.", f: "Ң дыбысы", tr: { ru: "У подножия высокой горы стоит новый аул.", en: "A new village stands at the foot of the high mountain." } },
    { t: "Шешем шәугімге шай қайнатты.", f: "Ш, Ә дыбыстары", tr: { ru: "Мама вскипятила чай в чайнике.", en: "My mother boiled tea in the kettle." } },
    { t: "Інім іні бар тышқанды іздеді.", f: "І, Ы дыбыстары", tr: { ru: "Мой младший брат искал мышь, у которой есть нора.", en: "My little brother looked for a mouse that has a burrow." } }
  ],
  ru: [
    { t: "Шла Саша по шоссе и сосала сушку.", f: "Ш, С" },
    { t: "На дворе трава, на траве дрова.", f: "Р, Д, В" },
    { t: "От топота копыт пыль по полю летит.", f: "П, Т" },
    { t: "Шесть мышат в шалаше шуршат.", f: "Ш" },
    { t: "Ехал Грека через реку, видит Грека — в реке рак.", f: "Р" },
    { t: "Карл у Клары украл кораллы, а Клара у Карла украла кларнет.", f: "К, Р, Л" },
    { t: "Четыре чёрненьких чумазеньких чертёнка чертили чёрными чернилами чертёж.", f: "Ч, Р" }
  ],
  en: [
    { t: "Red lorry, yellow lorry.", f: "R, L" },
    { t: "Unique New York, unique New York.", f: "N, Y" },
    { t: "She sells seashells by the seashore.", f: "S, SH" },
    { t: "A big black bug bit a big black bear.", f: "B" },
    { t: "Fresh fried fish, fish fresh fried.", f: "F, SH" },
    { t: "Peter Piper picked a peck of pickled peppers.", f: "P" },
    { t: "How much wood would a woodchuck chuck if a woodchuck could chuck wood?", f: "W, CH" }
  ]
};

export function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const sample = (a, n) => shuffle(a).slice(0, n);

/** Built-in items in the same shape the backend returns for /api/game/generate. */
export function builtinItems(kind, know, learn, level, n) {
  const k = IDX[know], l = IDX[learn];
  if (kind === "words") {
    const bank = WORDS[level];
    return sample(bank, n).map(row => {
      const others = shuffle(bank.filter(x => x !== row && x[k] !== row[k])).slice(0, 3).map(x => x[k]);
      return { word: row[l], translation: row[k], distractors: others };
    });
  }
  if (kind === "phrases") return sample(PHRASES[level], n).map(row => ({ text: row[l], translation: row[k] }));
  if (kind === "question") return sample(QUESTIONS[level], n).map(row => ({ question: row[l], translation: row[k], example_answer: "" }));
  if (kind === "riddle") return sample(RIDDLES, n).map(r => ({
    answer: r.a[l][0], accept: r.a[l], answer_translation: r.a[k][0],
    clues: r.c.map(c => c[l]), clues_translation: r.c.map(c => c[k])
  }));
  if (kind === "twister") {
    let list = TWISTERS[learn];
    const words = s => s.t.split(/\s+/).length;
    if (level === "easy") list = list.filter(x => words(x) <= 7);
    else if (level === "hard") list = list.filter(x => words(x) >= 6);
    return sample(list.length >= n ? list : TWISTERS[learn], n).map(x => ({
      text: x.t, focus: x.f, translation: (x.tr && x.tr[know]) || "", builtin_kk: learn === "kk"
    }));
  }
  return [];
}

export const _test = { WORDS, PHRASES, QUESTIONS, RIDDLES, TWISTERS };
