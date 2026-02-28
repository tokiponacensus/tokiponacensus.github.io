var getCategory;
var getMessage;
var rulesByCategory;

function parseLipuLinku(data) {
    return Object.keys(data).map(function(word) {
        return [word, data[word].usage_category];
    });
}

function build_rules(wordList) {

    function in_array(value, array) {
        return array.indexOf(value) !== -1;
    }

    let commonWords = wordList
        .filter((pair) => {
            return in_array(pair[1], ['common', 'core']);
        })
        .map((pair) => {
            return  ['a', 'n'].indexOf(pair[0]) != -1 // == 'n'
                 ? (pair[0] + '+') // Match aaaa... nnnnn...
                 : pair[0]
        });
    let uncommonWords = wordList
        .filter((pair) => {
            return !in_array(pair[1], ['common', 'core', 'sandbox']);
        })
        .map((pair) => pair[0]);

    let sandboxWords = wordList
        .filter((pair) => {
            return pair[1] == 'sandbox';
        })
        .map((pair) => pair[0]);

    /* Force some words to be in the "common words" category
     *
     *
     * - ali and oko: Those seem to have fallen out of usage, but it
     *   feels wrong to exclude pu words. I might revisit this
     *   decision in the future.
     *
     * - As of 2024-02, 'su' is too recent to be in use, but it's the
     *   title of official books and was part of the reserved words in
     *   ku.
     */
    ['ali', 'oko', 'su'].forEach((w) => {
        commonWords = commonWords.concat(w);
        uncommonWords = uncommonWords.filter((x) => x != w);
    });

    let allWords = commonWords.concat(uncommonWords).concat(sandboxWords);

    let matchesKnownWord = new RegExp('^\\b(' + allWords.join('|') + ')\\b$');

    // \x02 is the ASCII char:       002   2     02    STX (start of text)
    // Full sentence: includes all the `X la, Y la, ... Z`
    // Partial sentence: includes only one la/main-block
    let FULL_SENTENCE_SEPARATOR    = /(([\x02;.·…!?“”])\s*)/.source;
    let PARTIAL_SENTENCE_SEPARATOR = /(([\x02;.·…!?“”:]\s*(taso,?|a+(\s+a+)*\b,?)?)\s*|[,\s]*\bla\b[,\s]*|\btaso,|,\s*taso\b|\bo,\s|\s*\x02)/.source;
    let PARTICLES = 'en|li|e|la|pi|o|anu';
    let PREPOSITIONS = 'lon|tawa|tan|sama|kepeken';
    let PREVERBS = 'wile|sona|awen|kama|ken|lukin|open|pini|alasa';
    let PROPER_NOUNS = "((Jan|Jen|Jon|Jun|Kan|Ken|Kin|Kon|Kun|Lan|Len|Lin|Lon|Lun|Man|Men|Min|Mon|Mun|Nan|Nen|Nin|Non|Nun|Pan|Pen|Pin|Pon|Pun|San|Sen|Sin|Son|Sun|Tan|Ten|Ton|Tun|Wan|Wen|Win|An|En|In|On|Un|Ja|Je|Jo|Ju|Ka|Ke|Ki|Ko|Ku|La|Le|Li|Lo|Lu|Ma|Me|Mi|Mo|Mu|Na|Ne|Ni|No|Nu|Pa|Pe|Pi|Po|Pu|Sa|Se|Si|So|Su|Ta|Te|To|Tu|Wa|We|Wi|A|E|I|O|U)(jan|jen|jon|jun|kan|ken|kin|kon|kun|lan|len|lin|lon|lun|man|men|min|mon|mun|nan|nen|nin|non|nun|pan|pen|pin|pon|pun|san|sen|sin|son|sun|tan|ten|ton|tun|wan|wen|win|ja|je|jo|ju|ka|ke|ki|ko|ku|la|le|li|lo|lu|ma|me|mi|mo|mu|na|ne|ni|no|nu|pa|pe|pi|po|pu|sa|se|si|so|su|ta|te|to|tu|wa|we|wi)*)";

    let endsWithPartialSentenceBegin = new RegExp('(' + PARTIAL_SENTENCE_SEPARATOR + ')$');
    let endsWithFullSentenceBegin = new RegExp('(' + FULL_SENTENCE_SEPARATOR + ')$');
    let startsWithFullSentenceBegin = new RegExp('^(' + FULL_SENTENCE_SEPARATOR + ')');

    function startOfPartialSentence(match, behind) {
        return behind.match(endsWithPartialSentenceBegin);
    }

    function startOfFullSentence(match, behind) {
        return behind.match(endsWithFullSentenceBegin) || match[0].match(startsWithFullSentenceBegin);
    }

    function normalizePartialSentence(sentence) {
        // Clean punctuation, interjections and other particle words
        return sentence.replace(/^o,/, '')
                           .replace(/[^\w ]/g, ' ')
                           .replace(/\s+/g, ' ')
                           .trim()
                           .replace(/^((la|taso|a+(\s+a+)*)\s+)*/, '')
                           .replace(/\bla$/, '')
                           .trim();
    }

    function startingMiSinaIsntASubjectInTheMatch(m, behind) {
        return m[0].match(/^(mi|sina)\s/) && !startOfPartialSentence(m, behind)
    }

    function Err(rule, message, category, more_infos) {
        this.raw_rule = rule;

        if(typeof(rule[0]) === "undefined") {
            this.rule = new RegExp('^(' + rule.source + ')');
        } else {
            this.rule = [
                new RegExp('^(' + rule[0].source + ')'),
                rule[1]
            ];
        }
        this._regex = typeof(rule[0]) === "undefined" ? this.rule : this.rule[0];

        this.getMatch = function(line) {
            return line.match(this._regex.source);
        }

        this.message = message;
        this.category = category;
        this.more_infos = more_infos;
    }

    var rules = {

        // Ignore URLs
        url: new Err(
            // URL regex from https://stackoverflow.com/a/3809435
            /(https?:\/\/(www\.)?)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/i,
            '', false
        ),

        nasinNanpaLiSamaNanpaLoman: new Err(
            /\b[AMLTW]{2,}\b/,
            '', false
        ),

        nimiPuAla: new Err(
            [
                new RegExp(PARTIAL_SENTENCE_SEPARATOR + '?' + /(\b([a-z][a-zA-Z]*)\b)/.source),
                function(m, behind) {
                    return !m[m.length-1].match(matchesKnownWord);
                },
            ],
            'Palabra desconocida.',
            'error',
            'https://linku.la/'
        ),
        noLiAfterMiSina: new Err(
            [
                /(mi|sina)\s+li\b/,
                startOfPartialSentence,
            ],
            '<em>$1</em> usado con <em>li</em>.',
            'error',
            'https://github.com/kilipan/nasin-toki#the-particle-li'
        ),
        duplicateParticle: new Err(
            new RegExp(
                PARTICLES.split('|').concat(['ni']).map(function(x) {
                    return '\\b' + x + '\\s+' + x + '\\b';
                }).join('|')
            ),
            'Esta palabra no debería aparecer dos veces.',
            'error'
        ),
        duplicatePronoun: new Err(
            new RegExp(
                ['mi', 'sina', 'ona'].map(function(x) {
                    return '\\b' + x + '\\s+' + x + '\\b';
                }).join('|')
            ),
            function(m) {
                if(m[0].indexOf('mi') == 0)
                    return 'Esta palabra probablemente no debería aparecer dos veces, a menos que realmente quisieras decir <em>«yo soy yo»</em> o <em>«mi yo»</em>.';
                else if(m[0].indexOf('sina') == 0)
                    return 'Esta palabra probablemente no debería aparecer dos veces, a menos que realmente quisieras decir <em>«tú eres tú»</em> o <em>«tu tú»</em>.';
                else
                    return 'Esta palabra probablemente no debería aparecer dos veces, a menos que realmente quisieras decir <em>«son ellos mismos»</em> o <em>«su ellos»</em>.';
            },
            'possible-error'
        ),
        illFormedQuestion: new Err(
            [
                /[^;.·!“”]+?\?[\!\?]*/,
                function(m, behind) {

                    // Avoid matching "????" as an ill-formed question
                    if(!m[0].match(/[a-z-A-Z]/)) return false;

                    if(!startOfFullSentence(m, behind)) return false;

                    // No question word found
                    return !m[0].match(/\banu\b/) &&
                           !m[0].match(/\bseme\b/) &&
                           !m[0].match(/\b(.+)\s+ala\s+\1\b/);
                },
            ],
            'Pregunta mal formada.\n\nDeberías usar o bien la forma <em>«[verbo] ala [verbo]»</em>, la forma <em>«X, anu seme?»</em>, o al menos incluir una de las palabras <em>anu</em> o <em>seme</em>.',
            'nitpick',
            'https://github.com/kilipan/nasin-toki#questions'
        ),
        alaMultipleWords: new Err(
            [
                /\b((\w+\s+)+\w+)\s+ala\s+\2\b/,
                function(m, behind) {
                    let isParticle = new RegExp('^(' + PARTICLES + ')$');

                    // Particles aren't matched as part of that
                    return m[0].split(/[^a-z]/).filter(function(x) {
                        return x.match(isParticle);
                    }).length == 0;
                }
            ],
            'En preguntas de tipo <em>X ala X</em>, la parte repetida suele ser solo una palabra.\n\nPara frases de varias palabras, repite solo el núcleo (<em>sina moku ala moku mute?</em>).\nCuando tu pregunta contiene un preverbo, repite solo el preverbo (<em>sina ken ala ken pali?</em>).',
            'nitpick',
            'https://github.com/kilipan/nasin-toki#x-ala-x'
        ),
        dontCapitalizeSentences: new Err(
            [
                new RegExp(PARTIAL_SENTENCE_SEPARATOR + '?' +
                           '\\b(' +
                           allWords.map((x) => {
                               // Special case for nnnnnnnn...
                               return x == 'n+'
                                    ? 'Nn*'
                                    : x[0].toUpperCase() + x.slice(1)
                           }).join('|') + ')\\b'),
                function(m, b) {
                    return startOfFullSentence(m, b);
                },
            ],
            'Las frases no deberían empezar con mayúscula.',
            'error'
        ),
        puttingEAfterWordDoesntGerundizeIt: new Err(
            [
                new RegExp(
                    '(' + PARTIAL_SENTENCE_SEPARATOR + /([^.·!?;:]+?)/.source + '\\b(li|o)\\b' + ')'
                ),
                function(m, behind) {
                    let cleanSentence = normalizePartialSentence(m[0]);

                    return !cleanSentence.match(new RegExp(PARTIAL_SENTENCE_SEPARATOR)) &&
                           (!cleanSentence.match(/^mi\s/i) || cleanSentence.match(/^mi\s+e\b/i)) &&
                           (!cleanSentence.match(/^sina\s/i) || cleanSentence.match(/^sina\s+e\b/i)) &&
                           !cleanSentence.match(/^o.+\b(o|li)$/) &&
                           cleanSentence.match(/\be\b/);
                },
            ],
            "<em>e</em> es una partícula que introduce el objeto directo de un verbo. No puedes usarla dentro de un sujeto.\n\n" +
            'A veces basta con quitar el <em>e</em>. Por ejemplo, <em>«moku e kala li pona»</em> (mal formado para <em>«comer un pez es bueno»</em>) puede expresarse como <em>«moku kala li pona»</em> (<em>«comer peces es bueno»</em>).',
            'error',
            'https://www.youtube.com/watch?v=ywRsfMZjp8Q&t=1701s'
        ),
        tanRelativeClause: new Err(
            [
                new RegExp(
                    '(' + PARTIAL_SENTENCE_SEPARATOR + ')?\s*'
                    + /\btan\s+(mi|sina)\s+([a-z]+)/.source
                ),
                function(m, behind) {
                    let lastWord = m[m.length-1];

                    // Prioritize showing erroneous words over a possible error
                    if(!lastWord.match(matchesKnownWord))
                        return false;

                    return !in_array(lastWord, [
                        'wan', 'tu', 'mute', 'ale',
                        'a', 'kin', 'taso', 'ala',
                    ].concat(PREPOSITIONS.split('|'))
                     .concat(PARTICLES.split('|')));
                }
            ],
            '<em>tan</em> no se puede usar para crear una oración de relativo.\n\n¿Querías decir:\n<em>tan ni: $6 $7...</em>',
            'possible-error',
            'https://github.com/kilipan/nasin-toki#no-sentence-level-recursion',
        ),
        objectWithoutVerb: new Err(
            [
                new RegExp(
                    '(' + PARTIAL_SENTENCE_SEPARATOR + /([^.·!?;:]+?)/.source + '(' + PARTIAL_SENTENCE_SEPARATOR + ')' + ')'
                ),
                function(m, behind) {
                    let cleanSentence = normalizePartialSentence(m[0]);

                    return !cleanSentence.match(/\b(li|o)\b/) &&
                           (!cleanSentence.match(/^mi\s/i) || cleanSentence.match(/^mi\s+e\b/i)) &&
                           (!cleanSentence.match(/^sina\s/i) || cleanSentence.match(/^sina\s+e\b/i)) &&
                           cleanSentence.match(/\be\b/);
                },
            ],
            'Objeto sin verbo. ¿Te falta un <em>li</em> en algún sitio?',
            'error',
        ),
        objectWithoutVerbMiSinaEn: new Err(
            [
                new RegExp(
                    '(' + PARTIAL_SENTENCE_SEPARATOR + /([^.·!?;:]+?)/.source + '(' + PARTIAL_SENTENCE_SEPARATOR + ')' + ')'
                ),
                function(m, behind) {
                    let cleanSentence = normalizePartialSentence(m[0]);

                    return cleanSentence.match(/^(mi|sina)\s+[\s\S]*\ben\b[\s\S]+\be\b/i) &&
                           !cleanSentence.match(/\b(li|o)\b/);
                },
            ],
            'Se necesita <em>li</em> a menos que el sujeto sea exactamente y solo <em>mi</em> o exactamente y solo <em>sina</em>.\n\n' +
            'Por ejemplo, <em>«mi en sina moku»</em> debería escribirse como <em>«mi en sina li moku»</em>.',
            'error',
            'https://github.com/kilipan/nasin-toki#the-particle-li'
        ),
        onaMissingLi: new Err(
            [
                new RegExp(
                    '(' + PARTIAL_SENTENCE_SEPARATOR + '\\bona\\b(' + /([^.·!?;:]+?)/.source + ')(' + PARTIAL_SENTENCE_SEPARATOR + ')' + ')'
                ),
                function(m, behind) {
                    let cleanSentence = normalizePartialSentence(m[0]);

                    return !cleanSentence.match(/\b(li|o)\b/) && cleanSentence != 'ona';
                },
            ],
            function(m) {
                return 'Asegúrate de que <em>$6</em> sea un modificador de <em>ona</em>. Si querías usarlo como verbo, usa:\n\n<em>ona li $6</em>.';
            },
            'possible-error',
            'https://github.com/kilipan/nasin-toki#the-particle-li'
        ),
        piOneWord: new Err(
            new RegExp('(\\bpi\\s+[a-zA-Z]+(\\s+(li|e|en|la|o)\\b|(\\s*,?\\s*\\banu\\s+seme\\b)|(' + PARTIAL_SENTENCE_SEPARATOR + ')))'),
            '<em>pi</em> no significa «de». Como regla general, <em>pi</em> debería ir seguido de al menos dos palabras.',
            'error',
            'https://github.com/kilipan/nasin-toki#the-particle-pi-1'
        ),
        piXpi: new Err(
            new RegExp('\\bpi\\s+[a-zA-Z]+\\s+pi\\s+[a-zA-Z]+\\s+[a-zA-Z]+\\b'),
            'Uso sospechoso de <em>pi</em> aquí. Normalmente <em>pi</em> debería ir seguido de al menos dos modificadores.\n\n' +
            'Si intentas usar una palabra compuesta (<em>«X pi Y Z»</em>) para formar una segunda compuesta (<em>«W pi X pi Y Z»</em>), ten en cuenta que esta forma no es popular. Considera dividir tu expresión compleja en varias frases más simples.',
            'possible-error',
            'https://github.com/kilipan/nasin-toki#the-particle-pi-1'
        ),
        liPi: new Err(
            /\bli\s+pi\b/,
            'Estas dos partículas no deberían ir seguidas.\n\nSi lo viste en un curso antiguo de toki pona, puede que se usara en algún momento, pero ya no se usa.',
            'error'
        ),
        consecutiveParticles: new Err(
            [
                new RegExp('\\b(' + PARTICLES + ')\\s+(' + PARTICLES + ')\\b'),
                function(m, behind) {
                    return !(m[2] == 'la' && m[3] == 'o') &&
                           // nasin mute la, "anu" is always used as a replacement for another particle
                           // (e.g.: mi moku li lape => mi moku anu lape), but pu doesn't say anything
                           // about that. Allowing "jan li wile moku anu li wile lape" seems right
                           //
                           // "anu la" is a somewhat rare but not unheard of nasin
                           !(m[2] == 'anu' && in_array(m[3], ['li', 'e', 'o', 'la']));
                }
            ],
            'Estas dos partículas no deberían ir seguidas.',
            'error'
        ),
        misplacedParticles: new Err(
            (function() {
                let badStartOfSentenceParticles = PARTICLES.split('|')
                                                           .filter((x) =>
                                                                        x != 'o' // dropped 'sina'
                                                                     && x != 'la' // uncommon nasin, but some proficient speakers use it
                                                               //                    Important note: if this is removed,
                                                               //                    "taso la [...]" starts to be flagged too
                                                                     && x != 'anu' // 'anu' isn't well defined in pu
                                                                     && x != 'e' // already matched by other rules
                                                           )
                                                           .join('|');
                let badEndOfSentenceParticles = PARTICLES.split('|')
                                                         .filter((x) =>
                                                                      x != 'o'
                                                                   && x != 'e' // already matched by other rules
                                                                   && x != 'anu' // odd but experimental nasin: anu as a content word and "anu la"
                                                         )
                                                         .join('|');
                let regex = (
                      '((' + PARTIAL_SENTENCE_SEPARATOR + ')\\s*\\b(' + badStartOfSentenceParticles + ')\\b)'
                    + '|'
                    + '(\\b(' + badEndOfSentenceParticles + ')\\b\\s*(' + PARTIAL_SENTENCE_SEPARATOR + '))'
                );
                return new RegExp(regex);
            })(),
            'Partícula mal colocada.',
            'error'
        ),
        alaActionVerb: new Err(
            [
                /\b(mi|sina|li|o)\s+ala\s+e\b/,
                function(m, behind) {
                    return !startingMiSinaIsntASubjectInTheMatch(m, behind);
                }
            ],
            '<em>ala</em> como verbo de acción es poco común.\n\n' +
            'Esto significaría <em>«anular X»</em> o <em>«convertir X en nada»</em>.\n\n' +
            'Si querías decir <em>«no es X»</em>, probablemente deberías usar <em>«X li Y ala»</em>.',
            'possible-error',
            "https://github.com/kilipan/nasin-toki#negation"
        ),
        alaAsPredicate: new Err(
            [
                /\b(mi|sina|li|o)\s+ala\b(\s+(li|o)\b|(\s+tawa\s+([a-z]+)))?/,
                function(m, behind) {
                    if(
                        // mi ala li sona e ni => "mi ala" is the subject
                        (m[m.length-4] != null && in_array(m[m.length-3], ['li', 'o']) && in_array(m[m.length-5], ['mi', 'sina'])) ||
                        // "[... li] ala tawa e ijo" => bad negation
                        // "[... li] ala tawa mi/sina/..." => frequent construct
                        // e.g.: pali ni li ala tawa wawa mi
                        (m[m.length-2] != null && m[m.length-1] != 'e')
                    )
                    {
                        return false;
                    }

                    return !startingMiSinaIsntASubjectInTheMatch(m, behind);
                }
            ],
            '<em>ala</em> como predicado principal es poco común.\n\nPara negar algo, <em>ala</em> se coloca después, no antes.',
            "possible-error",
            "https://github.com/kilipan/nasin-toki#negation"
        ),
        weirdActionVerb: new Err(
            /\b(mi|sina|li|o)\s+(lon(\s+(sewi|anpa|poka|sinpin|monsi))?|sama|tan)(\s+(ala|kin))?\s+e\b/,
            function(m) {
                if(m[3] == 'sama') {
                    return 'Revisa: <em>sama</em> como verbo de acción (<em>sama e X</em>) es poco común.\n\n' +
                           'Esto significaría algo como <em>«hacer que X sea igual»</em>. ' +
                           'La forma preposicional <em>«sama X»</em> (<em>«como X»</em>, <em>«igual que X»</em>) es mucho más común.';
                } else if(m[3] == 'lon') {
                    return 'Revisa: <em>lon</em> como verbo de acción (<em>lon e X</em>) es poco común.\n\n' +
                           'Esto significaría <em>«hacer que X sea real/consciente/despierto»</em>. ' +
                           'La forma preposicional <em>«lon X»</em> (<em>«en/sobre X»</em>) es mucho más común.';
                } else if(m[3].indexOf("lon") == 0) {
                    let modifier = m[5];
                    let example = {
                        'sewi': 'en la parte superior de X',
                        'anpa': 'en la parte inferior de X',
                        'poka': 'al lado de X',
                        'sinpin': 'delante de X',
                        'monsi': 'detrás de X',
                    }[modifier];
                    return 'Revisa: <em>$2</em> como verbo de acción (<em>$2 e X</em>) es poco común.\n\n' +
                           'La forma preposicional <em>«$2 X»</em> (' + example + ') es mucho más común.';
                } else if(m[3] == 'tan') {
                    return 'Revisa: <em>tan</em> como verbo de acción (<em>tan e X</em>) es poco común.\n\n' +
                           'Esto significaría <em>«causar X»</em>. ' +
                           'La forma preposicional <em>«tan X»</em> (<em>«por X»</em>, <em>«de X»</em>) es mucho más común.';
                } else {
                    return 'Revisa: <em>$2</em> como verbo de acción (<em>$2 e X</em>) es poco común.';
                }
            },
            'possible-error',
            'https://github.com/kilipan/nasin-toki#a-comparative-analysis-of-prepositions'
        ),
        suspiciousTawa: new Err(
            [
                /\b(li|o|mi|sina)\s+tawa(\s+(ala|kin))?\s+e\s+(tomo|ma|mun|nasin|lupa|sewi)\b/,
                function(m, behind) {
                    return !startingMiSinaIsntASubjectInTheMatch(m, behind);
                }
            ],
            'Revisa: <em>tawa</em> como verbo de acción es sospechoso con este objeto.\n\nEsto significaría <em>«mover/desplazar X»</em>. La forma preposicional <em>«tawa X»</em> es mucho más común (<em>«ir a X»</em>, <em>«en dirección a X»</em>) con este objeto.\n\n¿Querías decir <em>tawa $4</em>?',
            'possible-error',
            'https://github.com/kilipan/nasin-toki#a-comparative-analysis-of-prepositions'
        ),
        badPreposition: new Err(
            [
                /\b(li|o|mi|sina)\s+(insa|poka)\b/,
                function(m, behind) {
                    return !startingMiSinaIsntASubjectInTheMatch(m, behind);
                }
            ],
            function(m) {
                if(m[3] == 'insa') {
                    return 'Revisa: <em>insa</em> como predicado es sospechoso. En la mayoría de casos significaría algo como «<em>es el interior</em> de X».\n\n' +
                           'Si querías decir «está dentro de X», probablemente deberías usar «lon insa X».';
                } else {
                    return 'Revisa: <em>poka</em> como predicado es sospechoso. Significaría algo como «<em>es el lado</em> de».\n\n' +
                           'Si querías decir «está al lado/cerca de X», probablemente deberías usar «lon poka X».';
                }
            },
            'possible-error'
        ),
        misplacedPreposition: new Err(
            [
                /\b(pana\s+tawa|toki\s+tawa|weka tan)\s+((([a-zA-Z]{2,}|n|a)\s+)+)\be\b/,
                function(m, behind) {
                    let foundAPreposition = false;
                    PARTICLES.split('|').filter((x) => x.length > 1).forEach((word) => {
                        foundAPreposition = foundAPreposition || m[3].match(new RegExp('\\b' + word + '\\b'));
                    });

                    return !foundAPreposition;
                }
            ],
            function(match) {

                let verb = match[2].split(/\s+/)[0];
                let preposition = match[2].split(/\s+/)[1];
                let preposition_target = match[3];

                return 'Normalmente la preposición va después del objeto.\n\n¿Querías decir:\n<em>' +
                       verb + ' e [...] ' + preposition + ' ' + preposition_target +
                       '</em>';
            },
            'possible-error',
            'https://github.com/kilipan/nasin-toki#how-to-use-prepositions'
        ),
        suspiciousVocativeO: new Err(
            new RegExp(PARTIAL_SENTENCE_SEPARATOR + '\\btoki\\s+o\\b(,|(' + PARTIAL_SENTENCE_SEPARATOR + '))'),
            '<em>toki o</em> por sí solo significaría algo como «¡eh, habla!», como si se estuviera llamando al habla.\n\n¿Querías decir:\n<em>toki</em>?',
            'possible-error',
            'https://github.com/kilipan/nasin-toki?tab=readme-ov-file#the-particle-o'
        ),
        lukinPona: new Err(
            [
                /* This rule is a bit tricky, it's a common mistake
                   made by newcomers, but it's also a valid way to
                   express a variety of things that experienced
                   speakers might want to use.

                   The simplest forms are matched

                       mi/sina lukin pona
                       X li lukin pona

                   but more complex forms will be ignored

                   e.g.
                       oko mi li wile e ilo _pi lukin pona_
                       o lukin pona!
                       sina lukin pona _e_ ni
                 */
                /\b(li|mi|sina)\s+lukin\s+pona\b(\s+e\b)?/,
                function(m, behind) {
                    // "lukin pona" as an action verb probably doesn't mean "beautiful"
                    if(m[m.length-1])
                        return false;

                    return !startingMiSinaIsntASubjectInTheMatch(m, behind);
                }
            ],
            '<em>lukin pona</em> se usa a menudo (de forma incorrecta) como calco del inglés «looks good». En toki pona, significaría más bien «mirar bien», «examinar» o «intentar mejorar».\n\nSi querías decir «visualmente bueno», usa <em>pona</em> como núcleo y <em>lukin</em> como modificador: <em>pona lukin</em>.',
            'possible-error',
            'https://www.reddit.com/r/tokipona/comments/sd3ufb/whats_different_between_pona_lukin_and_lukin_pona/'
        ),
        lukinSama: new Err(
            [
                /\b(li|o|mi|sina)\s+lukin\s+sama\b/,
                function(m, behind) {
                    return !startingMiSinaIsntASubjectInTheMatch(m, behind);
                }
            ],
            '<em>lukin sama</em> como verbo podría ser un calco del inglés <em>«looks the same»</em>.\n\n<em>lukin</em> como predicado principal significa <em>mirar</em> o <em>buscar</em>. Si querías decir <em>X se ve igual que Y</em>, considera usar algo como <em>X en Y li sama lukin</em> o <em>X li sama Y tawa lukin</em>.',
            'possible-error',
            'https://www.reddit.com/r/tokipona/comments/15tu3bm/'
        ),
        modifyingPreverb: new Err(
            [
                new RegExp(
                    /\b(li|o|mi|sina)\s+/.source + '(' + PREVERBS + ')' + /\s+(mute|lili|taso)\s+([a-z]+)\b(,?\s*anu\s+seme\b|\s+[a-z]+\b)?/.source
                ),
                function(m, behind) {

                    if(startingMiSinaIsntASubjectInTheMatch(m, behind))
                        return false;

                    let preverbModifier = m[m.length-3];
                    /* console.assert(['mute', 'lili', 'taso'].indexOf(preverbModifier) != -1); */

                    let lastModifier = m[m.length-2];

                    let possibleLookahead = m[m.length-1];
                    if(possibleLookahead)
                        possibleLookahead = possibleLookahead.replace(/^,/, '').trim().replace(/\s+/, ' ');

                    // Prioritize showing erroneous words over a nitpick
                    if(!lastModifier.match(matchesKnownWord))
                        return false;

                    let allowedThirdWord = PARTICLES.split('|')
                                                    .concat(['mute', 'lili']) // when insisting "mute mute"
                                                    .concat(['ala', 'kin', 'a']);

                    if(in_array(preverbModifier, ['mute', 'lili'])) {
                        allowedThirdWord = allowedThirdWord.concat(['taso']);
                    }

                    /* 'taso' could be used to join sentences
                           mi wile taso moku. => wrong
                           mi wile taso moku e X => wrong
                           mi wile taso moku li pona tawa mi" => ok
                           mi ken taso pali suli suli li wile e sijelo wawa" => ok
                     */
                    if(preverbModifier == 'taso' && !in_array(possibleLookahead, [undefined, 'e', 'anu seme'])) {
                        return false;
                    }

                    /*
                       Preposition words can be used as verbs, or could just be
                       prepositions following the verb

                       Nothing after the preposition
                           mi wile mute tawa. => wrong
                       Particle after the preposition
                           mi wile mute tawa e ni => wrong
                           mi wile mute tawa li wile e ni => wrong
                           mi wile mute tawa pi ike mute => wrong
                           sina wile mute tawa anu wile lili tawa  => wrong
                       Content word after the preposition
                           mi wile mute kepeken wile mi => possibly ok
                    */
                    if(!in_array(possibleLookahead, [undefined, 'anu seme'].concat(PARTICLES.split('|'))))
                        allowedThirdWord = allowedThirdWord.concat(PREPOSITIONS.split('|'));

                    return !in_array(lastModifier, allowedThirdWord);
                }
            ],
            'Parece que estás intentando modificar un preverbo («$2 <em>$3</em> $4»).\n\nExcepto para la negación con <em>ala</em>, añadir un modificador a un preverbo no es habitual y puede resultar confuso.',
            'nitpick',
            'https://github.com/kilipan/nasin-toki#negation-of-preverbs',
        ),
        /*
           I would also say "sama lili X" and "sama mute X" are suspicious when sama is a preposition
        */
        suspiciousEn: new Err(
            [
                /(\b(li|o|e)\b)\s+[^:;.·!?,]+\s+\ben\b/,
                function(m, behind) {
                    // `li ... la ... en` might be correct
                    let cleanSentence = normalizePartialSentence(m[0]);
                    return !cleanSentence.match(/\bla\b/);
                },
            ],
            '<em>en</em> separa sujetos; no es equivalente a la palabra inglesa <em>and</em>.\n\nPara varios verbos u objetos, usa varios <em>li</em>, varios <em>e</em> o varias preposiciones.',
            'error',
            'https://github.com/kilipan/nasin-toki#the-particle-en'
        ),
        suspiciousKepeken: new Err(
            /\bkepeken\s+(meli|mije|tonsi|jan)\b/,
            "Uso sospechoso de <em>kepeken</em> aquí.\n\n<em>kepeken Person</em> significa <em>«usando a Person»</em>, no <em>«con Person»</em>. Si querías decir <em>«con Person»</em> en el sentido de <em>«junto a Person»</em>, puedes usar algo como <em>«lon poka Person»</em>. También puedes reformularlo como <em>«X en Person li ...»</em>.",
            'possible-error',
            'https://sona.pona.la/wiki/With'
        ),
        unofficialWordWithoutNoun: new Err(
            [
                new RegExp('(' + PARTIAL_SENTENCE_SEPARATOR + '([^:;.·!?,]+(\\b(' +
                           'en|e|la|pi|o' + // "x li Proper Noun" is a common construct
                           '|lon|tawa|tan|kepeken)\\b)\\s+|(mi|sina)\\s+)?)(' + PROPER_NOUNS + '[a-z]*)'),
                function(m, behind) {
                    let cleanSentence = normalizePartialSentence(m[0]);

                    // Avoid matching uselessly capitalized toki pona words at the
                    // start of a sentence, another category of error matches
                    // that case
                    if(startOfFullSentence("foo", behind + m[2])) {
                        let matchedNoun = m[m.length - 4].toLowerCase();

                        if(matchedNoun.match(matchesKnownWord)) {
                            return false;
                        }
                    }

                    return !cleanSentence.match(/\bla\b/);
                }
            ],
            "Posible uso de un nombre no oficial sin un sustantivo delante.\n\nLos nombres propios suelen tratarse como adjetivos de palabras de toki pona. Asegúrate de que tu nombre propio vaya precedido de una palabra oficial.\n\n" +
            'Por ejemplo, <em>«mi tan Kanata»</em> debería ser <em>«mi tan ma Kanata»</em>. <em>«mi Sonja»</em> probablemente debería ser <em>«mi jan Sonja»</em>.',
            'possible-error',
            'https://mun.la/sona/bits.html#proper-names'
        ),
        oBeforeAdress: new Err(
            /\bo\s+(meli|mije|tonsi|jan|sina)\b/,
            "<em>o Person</em> es una orden/deseo de <em>personificar</em> algo. " +
            "Si querías dirigirte a alguien, la partícula <em>o</em> va después.\n\n" +
            'Por ejemplo, <em>«o jan Lakuse!»</em> debería ser <em>«jan Lakuse o!»</em>.',
            'possible-error',
            'https://www.youtube.com/watch?v=ywRsfMZjp8Q&t=1627s',
        ),
        piNanpa: new Err(
            /\bpi\s+nanpa\s+((wan|tu|luka|mute|ale|ali)\s+)*(wan|tu|luka|mute|ale|ali)/,
            'Cuando usas <em>nanpa</em> como marcador ordinal, no hace falta <em>pi</em>.',
            'possible-error',
            'https://github.com/kilipan/nasin-toki#ordinals'
        ),
        multiplePi: new Err(
            [
                /\bpi\s+([^:;.·!?,]+?)\s+pi\b/,
                (function() {
                    let regex = new RegExp('\\b(' + PARTICLES + '|' + PREPOSITIONS + ')\\b');
                    return function(m) {
                        return !m[m.length - 1].match(regex);
                    };
                })(),
            ],
            'Varios <em>pi</em> pueden dar lugar a sintagmas ambiguos; considera si todos los significados posibles son más o menos equivalentes o si el sentido es suficientemente claro en este contexto.',
            'nitpick',
            'https://github.com/kilipan/nasin-toki#in-pi-phrases'
        ),

        /* This will change from one nasin to another. While it is a
         * common nasin to prefer multiple short sentences to one very
         * big sentence, some sitelen pona styles make a convincing argument
         * for allowing very long sentences. Browse https://sitelenpona.org/ for examples
         */
        /* longSentence: new Err(
         *     [
         *         new RegExp('((' + FULL_SENTENCE_SEPARATOR + ')' + /([^.·!?;]+?)/.source + '(' + FULL_SENTENCE_SEPARATOR + ')' + ')'),
         *         function(m, behind) {
         *             return m[0].split(/[^a-z]+/).length > 30;
         *         },
         *     ],
         *     'Consider breaking long sentences into multiple smaller sentences. Small and simple is better than long and complex. From <em>lipu pu</em>:\n\n<em>"Simplify your thoughts. Less is more."</em>',
         *     'nitpick'
         * ), */

        unsubFromHalfAsInteresting: new Err(
            /\b(poki\s+loje\s+lon\s+sinpin\s+li\s+poki\s+tawa|suwi\s+telo\s+wawa\s+kepeken\s+namako\s+en\s+kule\s+ijo\s+kasi)\b/,
            'Por favor, date de baja de Half As Interesting.',
            'error'
        ),

        // Not an error, must match this before trying to match a nimiPuAla
        commonWords: new Err(
            [
                new RegExp('\\b((' + commonWords.join('|') + ')|' + /((Jan|Jen|Jon|Jun|Kan|Ken|Kin|Kon|Kun|Lan|Len|Lin|Lon|Lun|Man|Men|Min|Mon|Mun|Nan|Nen|Nin|Non|Nun|Pan|Pen|Pin|Pon|Pun|San|Sen|Sin|Son|Sun|Tan|Ten|Ton|Tun|Wan|Wen|Win|An|En|In|On|Un|Ja|Je|Jo|Ju|Ka|Ke|Ki|Ko|Ku|La|Le|Li|Lo|Lu|Ma|Me|Mi|Mo|Mu|Na|Ne|Ni|No|Nu|Pa|Pe|Pi|Po|Pu|Sa|Se|Si|So|Su|Ta|Te|To|Tu|Wa|We|Wi|A|E|I|O|U)(jan|jen|jon|jun|kan|ken|kin|kon|kun|lan|len|lin|lon|lun|man|men|min|mon|mun|nan|nen|nin|non|nun|pan|pen|pin|pon|pun|san|sen|sin|son|sun|tan|ten|ton|tun|wan|wen|win|ja|je|jo|ju|ka|ke|ki|ko|ku|la|le|li|lo|lu|ma|me|mi|mo|mu|na|ne|ni|no|nu|pa|pe|pi|po|pu|sa|se|si|so|su|ta|te|to|tu|wa|we|wi)*)/.source + ')\\b'),
                function(m, behind) {
                    // Avoid catching nimiSuliNasa (ma Mija*nm*a => ma Mijama)
                    return m[4] == undefined || !m[4].match(/n[nm]/);
                }
            ],
            '', false),

        sandboxWord: new Err(
            new RegExp('\\b(' + sandboxWords.join('|') + ')\\b'),
            'Palabra de <strong>sandbox</strong>. El sandbox es una colección de palabras propuestas que <strong>no se usan activamente</strong>.\n\n'
            + 'Si estás aprendiendo, <strong>mejor usa el diccionario principal</strong>: estas palabras no te ayudarán a hablar el idioma.',
            'uncommon',
            'https://linku.la/sandbox'
        ),

        uncommonWord: new Err(
            new RegExp('\\b(' + uncommonWords.join('|') + ')\\b'),
            'Palabra poco común; asegúrate de que tu público objetivo la conoce.',
            'uncommon',
            'https://linku.la/'
        ),

        // This rule matches words when the 'uncommon' category is disabled
        uncommonWordOk: new Err(
            new RegExp('\\b(' + uncommonWords.concat(sandboxWords).join('|') + ')\\b'),
            '', false
        ),

        nimiSuliNasa: new Err(
            /\b([AEIJKLMNOPSTUW])[aeijklmnopstuw]*n[nm][aeijklmnopstuw]*\b/,
            'La mayoría de la gente prefiere evitar usar una <em>m</em> o una <em>n</em> justo después de una sílaba que termina con una nasal final <em>n</em>.\n' +
            'Aunque no es una norma declarada oficialmente, los nombres propios de países en pu siguen esta convención.',
            'nitpick',
            'https://lipu-sona.pona.la/7a.html'
        ),

        nimiSuliPuAla: new Err(
            /\b([A-Z][a-zA-Z]*)\b/,
            'Nombre propio con sílabas no autorizadas.',
            'nitpick',
            'https://sona.pona.la/wiki/Phonotactics#Syllables'
        ),

        // This rule matches loan words when the 'nitpick' category is disabled
        properNounsOk: new Err(
            /\b([A-Z][a-zA-Z]*)\b/,
            '', false
        ),

        startOfText: new Err(
            /\x02/, '', false
        ),

        punctuation: new Err(/[^a-zA-Z]/, '', false),
        ignore: new Err(/./, '', false),

        wat: new Err(/^$/),
    };

    // XXX: If there are no sandbox words, the 'sandboxWord' regex makes the whole website explode (/\b\b/ matches a lot of things). Remove if it needed
    if(sandboxWords.length == 0)
        delete rules['sandboxWord'];

    rulesByCategory = {};

    Object.keys(rules).forEach(function(key) {
        let category = rules[key].category

        if(!category) return;

        if(!(category in rulesByCategory))
            rulesByCategory[category] = [];

        rulesByCategory[category].push(key);
    });

    getCategory = function(key) {
        if(!(key in rules))
            return false;

        return rules[key].category;
    };

    getMessage = function(key, match) {
        if(!(key in rules))
            return false;

        let err = rules[key]
        let message = err.message;

        if(typeof(message) == 'function') {
            message = message(match);
        }

        for(var i=1; i<match.length; i++) {
            message = message.replace(new RegExp('\\$'+(i-1), 'g'), match[i]);
        }

        if(err.more_infos) {
            message += '<br><a  class="more-infos" target="_blank" href="' + err.more_infos + '">[Más información]</a>';
        }

        return message;
    };

    return rules;
};

if(typeof(module) != 'undefined') {
    module.exports = {
        build_rules: build_rules,
        parseLipuLinku: parseLipuLinku,
    };
}
