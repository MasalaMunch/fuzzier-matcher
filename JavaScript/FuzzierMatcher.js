"use strict";

const FuzzierMatcher = (() => {

    const MultiSet = () => {
        const This = new Map();
        This.get = (item) => {
            const itemCount = Map.prototype.get.call(This, item);
            return itemCount === undefined? 0 : itemCount;
        };
        This.push = (item) => This.set(item, This.get(item)+1);
        This.pop = (item) => {
            const itemCount = This.get(item)-1;
            if (itemCount < 1) {
                This.delete(item);
                return 0;
            }
            This.set(item, itemCount);
            return itemCount;
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

    const MaxHeap = (compareItems, array) => {
        const fixChildren = (i, item) => {
            while (true) {
                const iLeftChild = (i<<1) + 1;
                if (iLeftChild < array.length) {
                    const leftChildItem = array[iLeftChild];
                    let iMaxChild;
                    let maxChildItem;
                    const iRightChild = iLeftChild + 1;
                    if (iRightChild < array.length) {
                        const rightChildItem = array[iRightChild];
                        if (compareItems(rightChildItem, leftChildItem) > 0) {
                            iMaxChild = iRightChild;
                            maxChildItem = rightChildItem;
                        } else {
                            iMaxChild = iLeftChild;
                            maxChildItem = leftChildItem;
                        }
                    } else {
                        iMaxChild = iLeftChild;
                        maxChildItem = leftChildItem;
                    }
                    if (compareItems(maxChildItem, item) > 0) {
                        array[i] = maxChildItem;
                        i = iMaxChild;
                    } else {
                        break;
                    }               
                } else {
                    break;
                }
            }
            array[i] = item;
        };
        for (let i=(array.length-2)>>1; i>=0; i--) {
            fixChildren(i, array[i]);
        }
        return {Max: () => array[0], delMax: () => fixChildren(0, array.pop())};
    };

    const CharMap = (str) => {
        const This = new Map();
        for (let i=0; i<str.length; i++) {
            const char = str.charCodeAt(i);
            const indices = This.get(char);
            if (indices === undefined) {
                This.set(char, [i]);
            } else {
                indices.push(i);
            }
        }
        return This;
    };

    const DumbWordList = (str) => [str];
    const DumbWordStr = (wordList) => wordList.join("");
    const DumbWordSrcIndicesList = (() => {
        const Range = (len) => {
            const This = new Array(len);
            for (let i=0; i<len; i++) {
                This[i] = i;
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

    const SimilarityScore = (numberA, numberB, minScore, maxScore) => {
        return Math.max(minScore, maxScore - Math.abs(numberA - numberB));
    };

    return (WordList=DefaultWordList, WordStr=DefaultWordStr, 
            WordSrcIndicesList=DefaultWordSrcIndicesList) => {

        let queryWordList = [];
        let bonusScoreWeight = 1;
        const queryWordMultiSet = MultiSet();
        const queryWordScoreWeights = LazyMap((word) => 1 / (1 + word.length));
        const queryWordCharMaps = LazyMap(CharMap);

        const WordMatchScore = (queryWord, targetWord, 
                                returnMatchedTargetIndicesInstead) => {

            let This = returnMatchedTargetIndicesInstead? [] : 0;
            const queryCharMap = queryWordCharMaps.get(queryWord);
            const targetCharMap = targetWordCharMaps.get(targetWord);
            const biggerCharMap = (
                queryCharMap.size > targetCharMap.size? 
                queryCharMap : targetCharMap
                );
            const smallerCharMap = (
                biggerCharMap === queryCharMap? targetCharMap : queryCharMap
                );
            for (const sChar of smallerCharMap.keys()) {
                const bIndices = biggerCharMap.get(sChar);
                if (bIndices !== undefined) {
                    const sIndices = smallerCharMap.get(sChar);
                    const moreIndices = (
                        sIndices.length > bIndices.length? sIndices : bIndices
                        );
                    const lessIndices = (
                        moreIndices === sIndices? bIndices : sIndices 
                        );
                    let iMin = 0;
                    for (let j=0; j<lessIndices.length; j++) {
                        const lessIndex = lessIndices[j];
                        let iMax = (
                            moreIndices.length - lessIndices.length + j
                            );
                        const iMinCache = iMin;
                        const iMaxCache = iMax;
                        let moreIndex;
                        while (iMax >= iMin) {
                            const iTest = iMin + ((iMax-iMin)>>1);
                            const testIndex = moreIndices[iTest];
                            if (lessIndex > testIndex) {
                                iMin = iTest+1;
                            } else if (lessIndex < testIndex) {
                                iMax = iTest-1;
                            } else { // lessIndex === testIndex
                                moreIndex = testIndex;
                                iMin = iTest+1;
                                break;
                            }
                        }
                        if (moreIndex === undefined) {
                            if (iMin > iMaxCache) {
                                moreIndex = moreIndices[iMax];
                            } else if (iMax < iMinCache) {
                                moreIndex = moreIndices[iMin++];
                            } else {
                                const iMinIndex = moreIndices[iMin];
                                const iMaxIndex = moreIndices[iMax];
                                if (Math.abs(iMinIndex - lessIndex) 
                                < Math.abs(lessIndex - iMaxIndex)) {
                                    moreIndex = iMinIndex;
                                    ++iMin;
                                } else {
                                    moreIndex = iMaxIndex;
                                }
                            }
                        }
                        if (returnMatchedTargetIndicesInstead) {
                            if (biggerCharMap === queryCharMap) {
                                This.push(
                                    moreIndices === sIndices? 
                                    moreIndex : lessIndex
                                    );
                            } else {
                                This.push(
                                    moreIndices === sIndices? 
                                    lessIndex : moreIndex
                                    );
                            }
                        } else {
                            This += SimilarityScore(
                                lessIndex, moreIndex, 1, queryWord.length+1
                                );
                        }
                    }
                }
            }
            return (
                returnMatchedTargetIndicesInstead? 
                This : queryWordScoreWeights.get(queryWord) * This
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
        const targetWordCharMaps = LazyMap(CharMap);

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

            const targetWordList = targetWordStrWordLists.get(targetWordStr);
            const bigWordList = (
                queryWordList.length > targetWordList.length? 
                queryWordList : targetWordList
                );
            const smallWordList = (
                bigWordList === queryWordList? targetWordList : queryWordList
                );
            const unpairedSmallListIndices = new Array(smallWordList.length);
            const smallBigListIndexHeapList = new Array(smallWordList.length);
            const smallScoresList = new Array(smallWordList.length);
            for (let i=0; i<smallWordList.length; i++) {
                unpairedSmallListIndices[i] = i;
                const bigListIndices = new Array(bigWordList.length);
                const scores = new Array(bigWordList.length);
                for (let j=0; j<bigWordList.length; j++) {
                    bigListIndices[j] = j;
                    scores[j] = (
                        bigWordList === queryWordList? 
                        queryWordMatchScoreMaps.get(bigWordList[j])
                            .get(smallWordList[i])
                        : queryWordMatchScoreMaps.get(smallWordList[i])
                            .get(bigWordList[j])
                        );
                    if (scores[j] > 0) {
                        scores[j] += bonusScoreWeight * SimilarityScore(
                            i, j, 0, queryWordList.length
                            );
                    }
                }
                smallBigListIndexHeapList[i] = MaxHeap(
                    (j, k) => scores[j] - scores[k], bigListIndices
                    );
                smallScoresList[i] = scores;
            }
            const smallBigIndexList = new Array(smallWordList.length);
            const bigSmallIndexList = new Array(bigWordList.length);
            while (unpairedSmallListIndices.length > 0) {
                const i = unpairedSmallListIndices.pop();
                const bigListIndexHeap = smallBigListIndexHeapList[i];
                while (true) {
                    const j = bigListIndexHeap.Max();
                    const iConflict = bigSmallIndexList[j];
                    if (iConflict === undefined) {
                        smallBigIndexList[i] = j;
                        bigSmallIndexList[j] = i;
                        break;
                    }
                    if (smallScoresList[i][j] > smallScoresList[iConflict][j]) {
                        smallBigIndexList[i] = j;
                        bigSmallIndexList[j] = i;
                        smallBigListIndexHeapList[iConflict].delMax();
                        unpairedSmallListIndices.push(iConflict);
                        break;
                    }
                    bigListIndexHeap.delMax();
                }
            }

            if (returnWordMatchedIndicesListInstead) {
                const This = new Array(targetWordList.length);
                if (bigWordList === queryWordList) {
                    for (let i=0; i<smallBigIndexList.length; i++) {
                        This[i] = queryWordMatchedTargetIndicesMaps
                            .get(bigWordList[smallBigIndexList[i]])
                                .get(smallWordList[i]);
                    }
                } else {
                    for (let i=0; i<smallBigIndexList.length; i++) {
                        const j = smallBigIndexList[i];
                        This[j] = queryWordMatchedTargetIndicesMaps
                            .get(smallWordList[i]).get(bigWordList[j]);
                    }  
                }
                return This;
            }
            let This = 0;
            for (let i=0; i<smallBigIndexList.length; i++) {
                This += smallScoresList[i][smallBigIndexList[i]];
            }
            return This;

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
                        queryWordScoreWeights.delete(word);
                        queryWordCharMaps.delete(word);
                        queryWordMatchScoreMaps.delete(word);
                        queryWordMatchedTargetIndicesMaps.delete(word);
                    }
                }
                queryWordList = newQueryWordList;
                let maxWordLen = 0;
                for (let i=0; i<queryWordList.length; i++) {
                    const len = queryWordList[i].length;
                    if (len > maxWordLen) {
                        maxWordLen = len;
                    }
                }
                bonusScoreWeight = (
                    1 / (1 + queryWordList.length * queryWordList.length 
                         * (1 + maxWordLen))
                    );
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
                            targetWordCharMaps.delete(word);
                        }
                    }
                }
            },
            clear: () => {
                queryWordMatchScoreMaps.clear();
                queryWordMatchedTargetIndicesMaps.clear();
                queryWordScoreWeights.clear();
                queryWordCharMaps.clear();
                targetWordMultiSet.clear();
                targetWordCharMaps.clear();
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