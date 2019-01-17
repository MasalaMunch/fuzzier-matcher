from flask import Flask, request, jsonify
from flask_cors import CORS
from random import randint

wordsFilePath = "words.txt" #SRC https://github.com/dwyl/english-words

wordCount = 0
with open(wordsFilePath) as wordsFile:
    for e in wordsFile:
        wordCount += 1

app = Flask(__name__)
CORS(app)

@app.route("/getSentences")
def zero():
    getCount = request.args.get("count", type=int)
    wordsPerSentence = request.args.get("wordsPerSentence", type=int)
    wordGetCount = getCount * wordsPerSentence
    def NextWordIndex(baseIndex, maxOffset=wordCount//wordGetCount-1):
        return randint(baseIndex, baseIndex+maxOffset)
    nextWordIndex = NextWordIndex(0)
    words = [None] * wordGetCount
    wordGottenCount = 0
    with open(wordsFilePath) as wordsFile:
        for i, word in enumerate(wordsFile):
            if i == nextWordIndex:
                words[wordGottenCount] = word[:-1] # remove newline
                wordGottenCount += 1
                if wordGottenCount == wordGetCount:
                    break
                nextWordIndex = NextWordIndex(i+1)
    sentences = [None] * getCount
    wordsIterator = iter(words)
    for i in range(getCount):
        sentence = [None] * wordsPerSentence
        for j in range(wordsPerSentence):
            sentence[j] = next(wordsIterator)
        sentences[i] = " ".join(sentence)
    return jsonify(sentences)

if __name__ == '__main__':
    app.run(debug=True)