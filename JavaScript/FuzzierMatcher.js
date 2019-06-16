"use strict";

const FuzzierMatcher = (() => {

    const MultiSet = () => {
        const This = new Map();
        This.push = (item) => {
            const count = This.get(item);
            This.set(item, count === undefined? 1 : count+1);
        };
        This.pop = (item) => {
            let count = This.get(item);
            if (count === undefined) {
                return 0;
            }
            if (--count === 0) {
                This.delete(item);
            } else {
                This.set(item, count);
            }
            return count;
        };
        return This;
    };

    const LazyMap = (ValFromKey) => {
        const This = new Map();
        This.get = (key) => {
            let val = Map.prototype.get.call(This, key);
            if (val === undefined) {
                val = ValFromKey(key);
                This.set(key, val);
            }
            return val;
        };
        return This;
    };

    const DumbWordList = (str) => [str];
    const DumbWordStr = (wordList) => wordList.join("");
    const DumbWordSrcIndicesList = (() => {
        const Range = (len) => {
            const This = new Array(len);
            while (len--) {
                This[len] = len;
            }
            return This;
        };
        return (srcStr, wordList) => [Range(srcStr.length)];
    })();

    const DefaultWordList = (str) => {
        const match = str.toLowerCase().match(/[^\s]+/g);
        return match === null? [] : match;
    };
    const DefaultWordStr = (wordList) => wordList.join(" ");
    const DefaultWordSrcIndicesList = (srcStr, wordList) => {
        const This = new Array(wordList.length);
        if (wordList.length > 0) {
            srcStr = srcStr.toLowerCase();
            let iSrc = 0;
            let iDst = 0;
            while (true) {
                if (srcStr.charCodeAt(iSrc) === wordList[iDst].charCodeAt(0)) {
                    This[iDst] = new Array(wordList[iDst].length);
                    for (let iWord=0; iWord<wordList[iDst].length; iWord++) {
                        This[iDst][iWord] = iSrc++;
                    }
                    if (++iDst === wordList.length) {
                        break;
                    }
                } else {
                    ++iSrc;
                }
            }
        }
        return This;
    };

    const AsyncWorker = (iterator, processItem, onFinish, targetFps=144) => {
    //SRC^ https://github.com/forrestthewoods/lib_fts/blob/master/code/fts_fuzzy_match.js

        var max_ms_per_frame = 1000/targetFps;
        let currentIteration = iterator.next();
        var resumeTimeout = null;

        // Perform matches for at most max_ms
        function step() {
            clearTimeout(resumeTimeout);
            resumeTimeout = null;

            var stopTime = performance.now() + max_ms_per_frame;

            while (!currentIteration.done) {
                if (performance.now() > stopTime) {
                    resumeTimeout = setTimeout(step, 1);
                    return;
                }

                processItem(currentIteration.value);

                currentIteration = iterator.next();
            }

            onFinish();
            return null;
        };

        return {
            start: step,
            //^ Must be called to start matching.
            //  I tried to make asyncMatcher auto-start via "var 
            //  resumeTimeout = step();" However setTimout behaving in 
            //  an unexpected fashion as onComplete insisted on 
            //  triggering twice.
            finish: function() {
            //^ Process full list. Blocks script execution until 
            //  complete
                max_ms_per_frame = Infinity;
                step();
            },
            stop: function() {
            //^ Abort current process
                if (resumeTimeout !== null)
                    clearTimeout(resumeTimeout);
            },
            };

    };

    return (WordList=DefaultWordList, WordStr=DefaultWordStr, 
            WordSrcIndicesList=DefaultWordSrcIndicesList) => {

        const intArrayAllocator = new Map();
        intArrayAllocator.take = (length) => {
            const freeArrays = intArrayAllocator.get(length);
            if (freeArrays === undefined || freeArrays.length === 0) {
                return new Int32Array(length);
            }
            return freeArrays.pop();
        };
        intArrayAllocator.give = (array) => {
            const freeArrays = intArrayAllocator.get(array.length);
            if (freeArrays === undefined) {
                intArrayAllocator.set(array.length, [array]);
            }
            else {
                freeArrays.push(array); 
            }
        };

        const MatchScore = (() => {

            const undefinedIndex = -1;

            return (lil, big, Subscore) => {

                if (lil.length > big.length) {
                    const tmp = lil;
                    lil = big;
                    big = tmp;
                }

                const bigToLil = intArrayAllocator.take(big.length);
                const lilToBig = intArrayAllocator.take(lil.length);
                const unpairedLilIndices = intArrayAllocator.take(lil.length);

                let i;

                i = big.length;
                while (i--) {
                    bigToLil[i] = undefinedIndex;
                }
                i = lil.length;
                while (i--) {
                    lilToBig[i] = undefinedIndex;
                }
                i = lil.length;
                while (i--) {
                    unpairedLilIndices[i] = i;
                }

                i = lil.length;
                while (i--) {

                    const lilIndex = unpairedLilIndices[i];
                    let chosenBigIndex, chosenLilConflictIndex;

                    let maxSubscore = 0;
                    let bigIndex = big.length;
                    while (bigIndex--) {
                        const subscore = Subscore(bigIndex, lilIndex, big, lil);
                        if (subscore > maxSubscore) {
                            const lilConflictIndex = bigToLil[bigIndex];
                            if (lilConflictIndex === undefinedIndex || 
                            subscore > Subscore(bigIndex, lilConflictIndex, big, 
                            lil)) {
                                chosenBigIndex = bigIndex;
                                chosenLilConflictIndex = lilConflictIndex;
                                maxSubscore = subscore;
                            }
                        }
                    }

                    if (chosenBigIndex !== undefined) {
                        bigToLil[chosenBigIndex] = lilIndex;
                        lilToBig[lilIndex] = chosenBigIndex;
                        if (chosenLilConflictIndex !== undefinedIndex) {
                            lilToBig[chosenLilConflictIndex] = undefinedIndex;
                            unpairedLilIndices[i++] = chosenLilConflictIndex;
                        }                
                    }

                }

                let score = 0;
                i = lil.length;
                while (i--) {
                    if (lilToBig[i] !== undefinedIndex) {
                        score += Subscore(lilToBig[i], i, big, lil);
                    }
                }

                intArrayAllocator.give(bigToLil);
                intArrayAllocator.give(lilToBig);
                intArrayAllocator.give(unpairedLilIndices);
                return score;

                //TODO implement returning of match information

                // if (returnWordMatchedIndicesListInstead) {
                //     const This = new Array(targetWordList.length);
                //     if (bigWordList === queryWordList) {
                //         for (let i=0; i<smallBigIndexList.length; i++) {
                //             This[i] = queryWordMatchedTargetIndicesMaps
                //                 .get(bigWordList[smallBigIndexList[i]])
                //                     .get(smallWordList[i]);
                //         }
                //     } else {
                //         for (let i=0; i<smallBigIndexList.length; i++) {
                //             const j = smallBigIndexList[i];
                //             This[j] = queryWordMatchedTargetIndicesMaps
                //                 .get(smallWordList[i]).get(bigWordList[j]);
                //         }  
                //     }
                //     return This;
                // }

            };

        })();

        let queryWordList = [];
        const queryWordMultiSet = MultiSet();

        const WordMatchScore = (queryWord, targetWord, 
                                returnMatchedTargetIndicesInstead) => {

            if (returnMatchedTargetIndicesInstead) {
                return [];
            }

            //TODO make division part more efficient
            return (1 / Math.max(queryWord.length, targetWord.length)) * MatchScore(
                queryWord, 
                targetWord, 
                (bigIndex, lilIndex, bigWord, lilWord) => {
                    if (bigWord.charCodeAt(bigIndex) === 
                    lilWord.charCodeAt(lilIndex)) {
                        return bigWord.length - Math.abs(bigIndex - lilIndex);
                    }
                    return 0;
                },
                );

        };
        const queryWordMatchScoreMaps = LazyMap((queryWord) => {
            return LazyMap((targetWord) => {
                return WordMatchScore(queryWord, targetWord);
            });
        });
        const queryWordMatchedTargetIndicesMaps = LazyMap((queryWord) => {
            return LazyMap((targetWord) => {
                return WordMatchScore(queryWord, targetWord, true);
            });
        });

        const targetWordMultiSet = MultiSet();

        const targetWordStrMultiSet = MultiSet();
        const targetWordStrWordLists = new Map();
        const targetStrWordStrs = LazyMap((str) => {
            const wordList = WordList(str);
            const wordStr = WordStr(wordList);
            targetWordStrWordLists.set(wordStr, wordList);
            for (let i=0; i<wordList.length; i++) {
                targetWordMultiSet.push(wordList[i]);
            }
            targetWordStrMultiSet.push(wordStr);
            return wordStr;
        });

        const WordStrMatchScore = (targetWordStr, 
                                   returnWordMatchedIndicesListInstead) => {

            if (returnWordMatchedIndicesListInstead) {
                return [];
            }
            return MatchScore(
                queryWordList,
                targetWordStrWordLists.get(targetWordStr),
                (bigIndex, lilIndex, bigWordList, lilWordList) => (
                    bigWordList === queryWordList? 
                    queryWordMatchScoreMaps.get(bigWordList[bigIndex])
                        .get(lilWordList[lilIndex])
                    : queryWordMatchScoreMaps.get(lilWordList[lilIndex])
                        .get(bigWordList[bigIndex])
                ),
                );

        };
        const targetWordStrMatchScores = LazyMap((wordStr) => {
            return WordStrMatchScore(wordStr);
        });
        const targetWordStrWordMatchedIndicesLists = LazyMap((wordStr) => {
            return WordStrMatchScore(wordStr, true);
        });

        const targetStrMatchedIndices = LazyMap((str) => {
            const matchedIndices = [];
            const wordStr = targetStrWordStrs.get(str);
            const wordSrcIndicesList = WordSrcIndicesList(
                str, targetWordStrWordLists.get(wordStr)
                );
            const wordMatchedIndicesList = targetWordStrWordMatchedIndicesLists
                .get(wordStr);
            for (let i=0; i<wordMatchedIndicesList.length; i++) {
                const matchedWordIndices = wordMatchedIndicesList[i];
                if (matchedWordIndices !== undefined) {
                    for (let j=0; j<matchedWordIndices.length; j++) {
                        matchedIndices.push(
                            wordSrcIndicesList[i][matchedWordIndices[j]]
                            );
                    }
                }
            }
            return matchedIndices;
        });

        return {
            setQuery: (str) => {
                targetStrMatchedIndices.clear();
                targetWordStrMatchScores.clear();
                targetWordStrWordMatchedIndicesLists.clear();
                const newQueryWordList = WordList(str);
                for (let i=0; i<newQueryWordList.length; i++) {
                    queryWordMultiSet.push(newQueryWordList[i]);
                }
                for (let i=0; i<queryWordList.length; i++) {
                    const word = queryWordList[i];
                    if (queryWordMultiSet.pop(word) === 0) {
                        queryWordMatchScoreMaps.delete(word);
                        queryWordMatchedTargetIndicesMaps.delete(word);
                    }
                }
                queryWordList = newQueryWordList;
            },
            getScore: (targetStr) => {
                return targetWordStrMatchScores.get(
                    targetStrWordStrs.get(targetStr)
                    );
            },
            getIndices: (targetStr) => {
                return targetStrMatchedIndices.get(targetStr);
            },
            getAsyncWorker: AsyncWorker,
            delete: (targetStr) => {
                targetStrMatchedIndices.delete(targetStr);
                if (targetStrWordStrs.has(targetStr)) {
                    const wordStr = targetStrWordStrs.get(targetStr);
                    targetStrWordStrs.delete(targetStr);
                    const wordList = targetWordStrWordLists.get(wordStr);
                    if (targetWordStrMultiSet.pop(wordStr) === 0) {
                        targetWordStrWordLists.delete(wordStr);
                        targetWordStrMatchScores.delete(wordStr);
                        targetWordStrWordMatchedIndicesLists.delete(wordStr);
                    }
                    for (let i=0; i<wordList.length; i++) {
                        const word = wordList[i];
                        if (targetWordMultiSet.pop(word) === 0) {
                            for (const scoreMap of 
                            queryWordMatchScoreMaps.values()) {
                                scoreMap.delete(word);
                            }
                            for (const matchedTargetIndicesMap of 
                            queryWordMatchedTargetIndicesMaps.values()) {
                                matchedTargetIndicesMap.delete(word);   
                            }
                        }
                    }
                }
            },
            clear: () => {
                intArrayAllocator.clear();
                queryWordMatchScoreMaps.clear();
                queryWordMatchedTargetIndicesMaps.clear();
                targetWordMultiSet.clear();
                targetWordStrMultiSet.clear();
                targetWordStrWordLists.clear();
                targetStrWordStrs.clear();
                targetWordStrMatchScores.clear();
                targetWordStrWordMatchedIndicesLists.clear();
                targetStrMatchedIndices.clear();
            },
            };

    };
    
})();