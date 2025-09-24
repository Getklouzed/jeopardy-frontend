import React, { useState, useEffect } from "react";
import "./App.css";
import { io } from "socket.io-client";

// ==================== Socket Connection ====================
const socket = io("https://jeopardy-backend-fkxg.onrender.com");



// ==================== Helpers ====================


// Generate empty board with categories & point values
const generateEmptyBoard = (categories, pointsArray) => {
  return categories.map((cat) => ({
    category: cat,
    questions: pointsArray.map((points) => ({
      points,
      asked: false,
      content: { text: "", image: "", video: "", audio: "" },
      answer: ""
    })),
  }));
};
const generatePlayableBoard = (boardData) => {
  return boardData.map((cat) => ({
    category: cat.category,
    questions: cat.questions.map((q) => ({
      points: q.points,
      asked: false, // all questions start unasked
      content: { ...q.content },
      answer: q.answer,
    })),
  }));
};


// ==================== MediaItem Component ====================
// Handles displaying text, images, videos (incl. YouTube), audio (incl. Spotify)
const MediaItem = ({ type, url }) => {
  if (!url) return null;

  if (type === "text")
    return <div style={{ border: "1px solid #ccc", padding: "5px" }}>{url}</div>;

  if (type === "image")
    return <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "200px" }} />;

  if (type === "video") {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];
      return (
        <iframe
          width="100%"
          height="150"
          src={`https://www.youtube.com/embed/${videoId}`}
          title={`YouTube video ${videoId}`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    return <video width="100%" controls src={url}></video>;
  }

  if (type === "audio") {
    const spotifyMatch = url.match(/open\.spotify\.com(?:\/intl-[a-z]{2})?\/track\/([a-zA-Z0-9]+)/i);
    if (spotifyMatch) {
      const trackId = spotifyMatch[1].split("?")[0];
      return (
        <iframe
          src={`https://open.spotify.com/embed/track/${trackId}`}
          width="100%"
          height="80"
          frameBorder="0"
          allow="encrypted-media"
          title={`Spotify track ${trackId}`}
        />
      );
    }
    return <audio controls src={url} style={{ width: "100%" }}></audio>;
  }

  return null;
};


    const QuestionModal = ({
      question,
      roomCode,
      revealAnswer,
      allocatePoints,
      closeModal,
      players,
      isHost
    }) => {
      if (!question) return null;

      // read showAnswer directly from question object
      const showAnswer = question.showAnswer;

      return (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0,
            width: "100%", height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex", justifyContent: "center", alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              padding: "20px",
              width: "400px",
              maxHeight: "90%",
              overflowY: "auto",
              borderRadius: "8px",
            }}
          >
            <h3>
              {question.points} – {question.content.text || "No Text"}
            </h3>

            {["image", "video", "audio"].map((type) =>
              question.content?.[type] ? (
                <div key={type} style={{ marginBottom: "10px" }}>
                  <strong>{type.toUpperCase()}:</strong>
                  <MediaItem type={type} url={question.content[type]} />
                </div>
              ) : null
            )}

            {/* REVEAL ANSWER BUTTON (host only) */}
            {!showAnswer && isHost && (
              <button onClick={revealAnswer} style={{ marginTop: "10px" }}>
                Reveal Answer
              </button>
            )}

            {/* SHOW ANSWER */}
            {showAnswer && (
              <>
                <p><strong>Answer:</strong> {question.answer}</p>

                {/* ALLOCATE POINTS (host only) */}
                {isHost && (
                  <div style={{ marginTop: "10px" }}>
                    <label>Allocate Points:</label>
                    {players.map((p) => (
                      <div key={p.id} style={{ marginBottom: "5px" }}>
                        <span>{p.name}: </span>
                        <button onClick={() => allocatePoints(p.id, question.points)}>
                          +{question.points}
                        </button>
                        <button onClick={() => allocatePoints(p.id, -question.points)}>
                          -{question.points}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* CLOSE BUTTON (host only) */}
                {isHost && (
                  <button
                    onClick={() => closeModal()}
                    style={{ marginTop: "10px", backgroundColor: "#ccc" }}
                  >
                    Close
                  </button>
                )}

              </>
            )}
          </div>
        </div>
      );
    };




// ==================== Main App ====================
function App() {
  // ---------- State ----------
  const [page, setPage] = useState("home");
  const [numPlayers, setNumPlayers] = useState(2);
  const [players, setPlayers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [playerScores, setPlayerScores] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const [roomCode, setRoomCode] = useState(null);
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isHost, setIsHost] = useState(false);

  const [editingCell, setEditingCell] = useState(null);

  const [boardPlayable, setBoardPlayable] = useState([]); // board for current stage
  const [currentStage, setCurrentStage] = useState("setup"); // "setup", "normal", "double", "final"
  const [showNextStageButton, setShowNextStageButton] = useState(false); // show next stage button

  const [wagered, setWagered] = useState(false);
  const [playerWager, setPlayerWager] = useState(0);
  const [playerWagers, setPlayerWagers] = useState({});
  const [playerAnswers, setPlayerAnswers] = useState({});
  const [showFinalQuestion, setShowFinalQuestion] = useState(false); // NEW
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [tempWager, setTempWager] = useState(playerWagers[socket.id] ?? "");


  const [finalResults, setFinalResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  // Track wagers submitted by players
  const [finalWagers, setFinalWagers] = useState({}); // { playerId: wager }
  const [allWagersSubmitted, setAllWagersSubmitted] = useState(false); // host button enabled

  const [allAnswersSubmitted, setAllAnswersSubmitted] = useState(false);
  const [showCategory, setShowCategory] = useState(false);





  // ---------- Categories & Boards ----------
  const [categories, setCategories] = useState(["Category 1", "Category 2", "Category 3", "Category 4", "Category 5"]);
  const [board, setBoard] = useState(generateEmptyBoard(categories, [100, 200, 400, 600, 1000]));

  const [categoriesDouble, setCategoriesDouble] = useState(["Double 1", "Double 2", "Double 3", "Double 4", "Double 5"]);
  const [boardDouble, setBoardDouble] = useState(generateEmptyBoard(categoriesDouble, [200, 400, 800, 1200, 2000]));

  const [activeBoard, setActiveBoard] = useState(board);

  const [finalJeopardy, setFinalJeopardy] = useState({
    category: "Final Jeopardy",
    content: { text: "", image: "", video: "", audio: "" },
    answer: ""
  });



  // Add a new category to the board
  const addCategory = (isDouble) => {
    if (isDouble) {
      const newCategories = [...categoriesDouble, `Double ${categoriesDouble.length + 1}`];
      setCategoriesDouble(newCategories);
      setBoardDouble(generateEmptyBoard(newCategories, [200, 400, 800, 1200, 2000]));
    } else {
      const newCategories = [...categories, `Category ${categories.length + 1}`];
      setCategories(newCategories);
      setBoard(generateEmptyBoard(newCategories, [100, 200, 400, 600, 1000]));
    }
  };

  // Remove a category by index
  const removeCategory = (index, isDouble) => {
    if (isDouble) {
      const newCategories = categoriesDouble.filter((_, i) => i !== index);
      setCategoriesDouble(newCategories);
      setBoardDouble(generateEmptyBoard(newCategories, [200, 400, 800, 1200, 2000]));
    } else {
      const newCategories = categories.filter((_, i) => i !== index);
      setCategories(newCategories);
      setBoard(generateEmptyBoard(newCategories, [100, 200, 400, 600, 1000]));
    }
  };

  // Rename a category at a specific index
  const renameCategory = (index, newName, isDouble) => {
    if (isDouble) {
      const newCategories = [...categoriesDouble];
      newCategories[index] = newName;
      setCategoriesDouble(newCategories);

      const newBoard = [...boardDouble];
      newBoard[index].category = newName;
      setBoardDouble(newBoard);
    } else {
      const newCategories = [...categories];
      newCategories[index] = newName;
      setCategories(newCategories);

      const newBoard = [...board];
      newBoard[index].category = newName;
      setBoard(newBoard);
    }
  };
    const revealAnswerForAll = () => {
      if (!currentQuestion) return;
      socket.emit("revealAnswer", { roomCode, questionId: currentQuestion.id });
    };

const closeModal = () => {
  console.log("Closing modal for room:", roomCode);
  if (!roomCode) return console.error("roomCode undefined!");

  socket.emit("closeQuestionModal", { roomCode });
};


const submitWager = () => {
  socket.emit("submitFinalWager", {
    roomCode,
    playerId: socket.id,
    wager: playerWager,
  });
};



// ---------- Socket Events ----------
useEffect(() => {
  // Update player list
  socket.on("updatePlayers", (players) => setPlayers(players));

  // Chat messages
  socket.on("chatUpdate", (msgs) => setChatMessages(msgs));

  // Host selects a question (opens modal)
  socket.on("questionSelected", (question) => {
    setCurrentQuestion(question);
    setShowAnswer(false);
  });

  // Full scores update
  socket.on("updateScores", (scores) => setPlayerScores(scores || []));

  // Game started
  socket.on("gameStarted", (data) => {
    if (!data || !data.boardPlayable) {
      console.warn("Board data not received!", data);
      return;
    }
    setBoardPlayable(data.boardPlayable);
    setPlayerScores(data.scores || []);
    setGameStarted(true);
    setCurrentStage("normal");
    setShowNextStageButton(false);
  });

  // Host clicked a cell → update board and current question
socket.on("cellClicked", ({ colIndex, rowIndex }) => {
  setBoardPlayable((prev) => {
    const newBoard = [...prev];
    newBoard[colIndex].questions[rowIndex].asked = true;
    return newBoard;
  });
});




  // Update modal (show question / reveal answer / close)
  socket.on("updateQuestionModal", (question) => {
    console.log("updateQuestionModal received:", question);
    setCurrentQuestion(question); // will be null if modal closed
    setShowAnswer(false); // reset local showAnswer state
  });

socket.on("stageAdvanced", ({ currentStage, boardPlayable }) => {
  if (boardPlayable) {
    setBoardPlayable(boardPlayable); // use host-prepped board
  }

  setCurrentStage(currentStage);
  setShowNextStageButton(false);
});

    //final jeopardy
  socket.on("finalJeopardyStarted", (question) => {
    console.log("Final Jeopardy object received:", question);
    setFinalJeopardy(question);   // set entire object with category, question, media
    setShowFinalQuestion(true);   // show the question
    setShowAnswer(false);         // ensure answer is hidden
    setShowResults(false);        // reset final podium
  });


socket.on("finalResults", (data) => {
  // Update the final results panel
  setFinalResults(data.results);
  setShowResults(true);
  setShowFinalQuestion(false);

  // Update the main playerScores for the top-left scoreboard
  setPlayerScores((prevScores) =>
    prevScores.map((player) => {
      const updated = data.results.find((r) => r.id === player.id);
      return updated ? { ...player, score: updated.score } : player;
    })
  );
});



   socket.on("submitFinalWager", ({ roomCode, playerId, wager }) => {
     if (!finalWagers[roomCode]) finalWagers[roomCode] = {};
     finalWagers[roomCode][playerId] = wager;

     // Check if all players submitted
     const allSubmitted = Object.keys(finalWagers[roomCode]).length === playerScores[roomCode].length;

     io.to(roomCode).emit("updateFinalWagers", {
       allWagersSubmitted: allSubmitted,
       playerWagers: finalWagers[roomCode],
     });
   });
   // Host listens for this event
   socket.on("finalAnswerUpdate", ({ allAnswered }) => {
     if (allAnswered) setAllAnswersSubmitted(true); // host sees Reveal Answer button
   });

socket.on("finalJeopardyCategory", ({ category }) => {
  setFinalJeopardy(prev => ({ ...prev, category }));
  setShowCategory(true);  // now the UI shows immediately
});


  // Cleanup
  return () => {
    socket.off("updatePlayers");
    socket.off("chatUpdate");
    socket.off("questionSelected");
    socket.off("updateScores");
    socket.off("gameStarted");
    socket.off("cellClicked");
    socket.off("updateQuestionModal");
    socket.off("stageAdvanced");
    socket.off("finalJeopardyStarted");
    socket.off("finalJeopardyCategory");
    socket.off("revealFinalCategory");
    socket.off("submitFinalWager");
    socket.off("finalAnswerUpdate");
    socket.off("finalResults");
  };
}, []); // empty dependency array ensures listeners attach once


// ---------- Check if board is complete to show next stage button ----------
useEffect(() => {
  if (!boardPlayable || boardPlayable.length === 0) return;

  const boardComplete = boardPlayable.every(cat =>
    cat.questions.every(q => q.asked)
  );

  setShowNextStageButton(boardComplete);
}, [boardPlayable]);

// ---------- wagers -----------
useEffect(() => {
  const handleUpdateFinalWagers = (data) => {
    setFinalWagers(data.finalWagers);
    setAllWagersSubmitted(data.allSubmitted);
  };

  socket.on("updateFinalWagers", handleUpdateFinalWagers);

  return () => {
    socket.off("updateFinalWagers", handleUpdateFinalWagers);
  };
}, []);


  // ---------- Room Functions ----------
  const createRoom = (playersLimit) => {
    socket.emit("createRoom", { numPlayers: playersLimit }, ({ code }) => {
      setRoomCode(code);
      setIsHost(true);
      setPage("create");
    });
  };

  const joinRoom = () => {
    if (!joinName.trim()) {
      alert("Enter a name");
      return;
    }
    socket.emit("joinRoom", { code: joinCode, name: joinName }, (res) => {
      if (res.error) {
        alert(res.error);
      } else {
        setRoomCode(res.code);
        setIsHost(false);
        setPage("create");
        setPlayers(res.roomPlayers);
      }
    });
  };

  const updateRoomLimit = (newLimit) => {
    socket.emit("updateRoomLimit", { code: roomCode, numPlayers: newLimit });
  };

  const sendMessage = () => {
    if (!chatInput) return;
    socket.emit("chatMessage", { code: roomCode, sender: joinName || "host", message: chatInput });
    setChatInput("");
  };

  // ---------- Game Logic ----------
const startGame = () => {
  if (!isHost) return;

  if (!board || board.length === 0) {
    console.warn("Board is empty!");
    return;
  }

  const playable = generatePlayableBoard(board);
  setBoardPlayable(playable);
  setCurrentStage("normal");
  setGameStarted(true);

  // initialize player scores snapshot
  const scores = players.map(p => ({ id: p.id, name: p.name, score: 0 }));
  setPlayerScores(scores);

  // Emit to server (server will broadcast to room)
  socket.emit("startGame", { roomCode, scores, boardPlayable: playable });
};



const selectQuestion = (catIndex, rowIndex, question) => {
  if (!isHost) return;

  socket.emit("openQuestionModal", { roomCode, question: { catIndex, rowIndex, ...question } });
};


const updatePlayerScore = (playerId, points) => {
  // handle invalid playerId gracefully
  if (!playerId) {
    console.warn("updatePlayerScore called without playerId");
    return;
  }

  setPlayerScores(prev => {
    const newScores = prev.map(player =>
      player.id === playerId
        ? { ...player, score: (player.score || 0) + points }
        : player
    );

    // Emit the new scores to server
    socket.emit("updateScores", { roomCode, scores: newScores });

    return newScores;
  });

};



  const startDoubleJeopardy = () => {
    setActiveBoard(boardDouble);
    setCurrentStage(true);
  };

 const handleNumPlayersChange = (e) => {
   let val = parseInt(e.target.value);
   if (isNaN(val) || val < 2) val = 2;
   if (val > 10) val = 10;
   setNumPlayers(val);
   if (roomCode) updateRoomLimit(val);
 };

const handleCellClick = (catIndex, rowIndex) => {
  const question = boardPlayable[catIndex].questions[rowIndex];
  if (question.asked) return;

  const newBoard = [...boardPlayable];
  newBoard[catIndex].questions[rowIndex].asked = true;
  setBoardPlayable(newBoard);

  // Broadcast to all clients (to mark question as asked)
  socket.emit("cellClicked", { roomCode, catIndex, rowIndex });

  // Host opens modal via selectQuestion
  selectQuestion(catIndex, rowIndex, question);
};


  // Check if board is fully asked
  const checkBoardComplete = (boardData) => {
    return boardData.every(cat => cat.questions.every(q => q.asked));
  };

 const allocatePoints = (playerId, points) => {
   updatePlayerScore(playerId, points);
 };


  // ---------- Rendering ----------
  const renderGameBoard = (boardData) => (
    <table style={{ margin: "0 auto", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {boardData.map((cat, i) => (
            <th key={i} style={{ border: "1px solid black", padding: "10px" }}>
              {cat.category}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {boardData[0].questions.map((_, row) => (
          <tr key={row}>
            {boardData.map((cat, i) => (
              <td
                key={i}
                style={{
                  border: "1px solid black",
                  padding: "20px",
                  cursor: "pointer",
                  backgroundColor: "#61dafb",
                }}
                onClick={() => selectQuestion(i, row, cat.questions[row])}
              >
                {cat.questions[row].points}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
    const renderBoardTable = (boardData, isDouble) => (
      <>
        <table style={{ margin: "0 auto", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {boardData.map((cat, i) => (
                <th key={i} style={{ border: "1px solid black", padding: "10px" }}>
                  <input
                    type="text"
                    value={cat.category}
                    onChange={(e) => renameCategory(i, e.target.value, isDouble)}
                  />
                  <button onClick={() => removeCategory(i, isDouble)}>Remove</button>
                </th>
              ))}
              <th>
                <button onClick={() => addCategory(isDouble)}>Add Category</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {boardData[0].questions.map((_, row) => (
              <tr key={row}>
                {boardData.map((cat, i) => (
                  <td
                    key={i}
                    style={{
                      border: "1px solid black",
                      padding: "20px",
                      cursor: "pointer",
                      backgroundColor: "#61dafb",
                    }}
                    onClick={() => setEditingCell({ catIndex: i, rowIndex: row, isDouble })}
                  >
                    {cat.questions[row].points}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          {/* EXPORT TO CLIPBOARD */}
          <button
            onClick={() => {
              const boardCopy = boardData.map((cat) => ({
                ...cat,
                questions: cat.questions.map((q) => ({ ...q })),
              }));
              navigator.clipboard.writeText(JSON.stringify(boardCopy, null, 2));
              alert("Board JSON copied to clipboard!");
            }}
          >
            Export {isDouble ? "Double" : ""} Board
          </button>

          {/* IMPORT FROM CLIPBOARD */}
          <button
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                const imported = JSON.parse(text);
                if (!Array.isArray(imported)) throw new Error("Invalid board JSON");

                const newBoard = imported.map((cat, i) => ({
                  category: cat.category,
                  questions: cat.questions.map((q, j) => ({
                    points: boardData[i]?.questions[j]?.points || q.points,
                    content: q.content || { text: "", image: "", video: "", audio: "" },
                    answer: q.answer || "",
                    asked: q.asked || false,
                  })),
                }));

                if (isDouble) setBoardDouble(newBoard);
                else setBoard(newBoard);

                alert("Board imported successfully!");
              } catch (err) {
                alert("Failed to import board: " + err.message);
              }
            }}
          >
            Import {isDouble ? "Double" : ""} Board
          </button>

          {/* SAVE AS FILE */}
          <button
            onClick={() => {
              const dataStr = JSON.stringify(boardData, null, 2);
              const blob = new Blob([dataStr], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = isDouble ? "jeopardy_double_board.txt" : "jeopardy_board.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Save {isDouble ? "Double" : ""} Board
          </button>
        </div>
      </>
    );

const renderPlayableBoard = (boardData, isDouble) => {
  if (!boardData || boardData.length === 0) {
    return <p style={{ textAlign: "center", marginTop: "20px" }}>Board not ready</p>;
  }

  return (
    <table style={{ margin: "0 auto", borderCollapse: "collapse", width: "90%" }}>
      <thead>
        <tr>
          {boardData.map((cat, i) => (
            <th
              key={i}
              style={{
                border: "1px solid black",
                padding: "10px",
                minWidth: "150px",
                textAlign: "center",
              }}
            >
              {cat?.category || "Category"}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {boardData[0]?.questions?.map((_, rowIndex) => (
          <tr key={rowIndex}>
            {boardData.map((cat, colIndex) => {
              const q = cat?.questions?.[rowIndex];
              if (!q) return <td key={colIndex}></td>;

              // Disable clicks for non-hosts or already asked questions
              const disabled = q.asked || !isHost;

              return (
                <td
                  key={colIndex}
                  style={{
                    border: "1px solid black",
                    padding: "20px",
                    cursor: disabled ? "default" : "pointer",
                    backgroundColor: q.asked ? "#999" : "#61dafb",
                    textAlign: "center",
                    verticalAlign: "middle",
                    height: "80px",
                    width: "150px",
                  }}
                  onClick={() => {
                    if (disabled) return;

                    // Emit to server: marks question as asked and opens modal for all
                    socket.emit("cellClicked", { roomCode, colIndex, rowIndex });
                    selectQuestion(colIndex, rowIndex, q);

                    // Host cannot mark board locally; server will broadcast updates
                  }}
                >
                  {q.points}
                </td>
              );
            })}
          </tr>
        )) || null}
      </tbody>
    </table>
  );
};

console.log("Current player scores:", playerScores);
// ==================== JSX ====================
return (
  <>
    {/* MAIN CONTAINER */}
    <div style={{ textAlign: "center", marginTop: "50px" }}>

      {/* ================= HOME PAGE ================= */}
      {page === "home" && (
        <>
          <h1>Jeopardy Game</h1>

          {/* Player Limit + Create Room */}
          <div style={{ marginBottom: "10px" }}>
            <label>Player Limit: </label>
            <input
              type="number"
              value={numPlayers}
              onChange={(e) => setNumPlayers(e.target.value)}
              onBlur={() => {
                let val = parseInt(numPlayers);
                if (isNaN(val) || val < 2) val = 2;
                if (val > 10) val = 10;
                setNumPlayers(val);
                if (roomCode) updateRoomLimit(val);
              }}
              style={{ width: "60px", marginRight: "5px" }}
            />
            <button
              onClick={() => {
                let val = parseInt(numPlayers);
                if (isNaN(val) || val < 2) val = 2;
                if (val > 10) val = 10;
                setNumPlayers(val);
                createRoom(val);
              }}
            >
              Create Room
            </button>
          </div>

          {/* Go to Join Page */}
          <button onClick={() => setPage("join")} style={{ marginLeft: "10px" }}>
            Join Room
          </button>
        </>
      )}

      {/* ================= CREATE PAGE (Host or Waiting Room) ================= */}
      {page === "create" && !gameStarted && (
        <div>
          {isHost ? (
            <>
              <h2>Create Room (Host)</h2>

              {/* Floating Room Code */}
              {roomCode && !gameStarted && (
                <div
                  style={{
                    position: "fixed",
                    top: "10px",
                    right: "10px",
                    backgroundColor: "#ffeb3b",
                    color: "#000",
                    padding: "15px 20px",
                    borderRadius: "8px",
                    fontSize: "24px",
                    fontWeight: "bold",
                    boxShadow: "0 0 10px rgba(0,0,0,0.3)",
                    zIndex: 1000,
                  }}
                >
                  Room Code: {roomCode}
                </div>
              )}

              {/* Player Limit Select */}
              <label>
                Player Limit:{" "}
                <select value={numPlayers} onChange={handleNumPlayersChange}>
                  {[...Array(9)].map((_, i) => (
                    <option key={i + 2} value={i + 2}>
                      {i + 2}
                    </option>
                  ))}
                </select>
              </label>

              {/* Show Boards for Editing (ONLY if game not started) */}
              {!gameStarted && (
                <>
                  <h3 style={{ marginTop: "20px" }}>Normal Jeopardy Board</h3>
                  {renderBoardTable(board, false)}

                  <h3 style={{ marginTop: "40px" }}>Double Jeopardy Board</h3>
                  {renderBoardTable(boardDouble, true)}

                  {/* Final Jeopardy */}
                  <h3 style={{ marginTop: "30px" }}>Final Jeopardy</h3>

                  {["category", "text", "image", "video", "audio"].map((type) => (
                    <div key={type} style={{ marginBottom: "10px" }}>
                      <label>{type.charAt(0).toUpperCase() + type.slice(1)}:</label>
                      <input
                        type="text"
                        value={
                          type === "category"
                            ? finalJeopardy.category
                            : finalJeopardy.content[type]
                        }
                        onChange={(e) => {
                          if (type === "category") {
                            setFinalJeopardy({
                              ...finalJeopardy,
                              category: e.target.value,
                            });
                          } else {
                            setFinalJeopardy({
                              ...finalJeopardy,
                              content: {
                                ...finalJeopardy.content,
                                [type]: e.target.value,
                              },
                            });
                          }
                        }}
                        style={{ width: "100%" }}
                      />

                      {type !== "category" && (
                        <div style={{ marginTop: "5px" }}>
                          <MediaItem type={type} url={finalJeopardy.content[type]} />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Answer input stays after all the content inputs */}
                  <div style={{ marginBottom: "10px" }}>
                    <label>Answer:</label>
                    <input
                      type="text"
                      value={finalJeopardy.answer}
                      onChange={(e) =>
                        setFinalJeopardy({
                          ...finalJeopardy,
                          answer: e.target.value,
                        })
                      }
                      style={{ width: "100%" }}
                    />
                  </div>


                  {/* Start Game Button */}
                  <button
                    style={{ marginTop: "20px" }}
                    onClick={startGame}
                  >
                    Start Game
                  </button>
                </>
              )}
            </>
          ) : (
            // Non-Host View
            <div>
              <h2>Waiting Room</h2>
              <p>Room Code: {roomCode}</p>
              <p>Waiting for the host to start the game...</p>
            </div>
          )}

          {/* Floating Players List */}
          {!gameStarted && (
          <div
            style={{
              position: "fixed",
              top: "10px",
              left: "10px",
              width: "150px",
              backgroundColor: "#f0f0f0",
              padding: "10px",
              borderRadius: "8px",
              boxShadow: "0 0 5px rgba(0,0,0,0.3)",
            }}
          >
            <h4>Players</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {players.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
          )}

          {/* Floating Chat */}
          <div
            style={{
              position: "fixed",
              bottom: "10px",
              right: "10px",
              width: chatOpen ? "300px" : "50px",
              height: chatOpen ? "400px" : "50px",
              backgroundColor: "#fff",
              border: "1px solid #ccc",
              borderRadius: "8px",
              boxShadow: "0 0 5px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                backgroundColor: "#0078ff",
                color: "#fff",
                padding: "5px",
                cursor: "pointer",
              }}
              onClick={() => setChatOpen(!chatOpen)}
            >
              Chat {chatOpen ? "▼" : "▲"}
            </div>

            {chatOpen && (
              <>
                <div style={{ flex: 1, overflowY: "auto", padding: "5px" }}>
                  {chatMessages.map((msg, i) => (
                    <div key={i}>
                      <strong>{msg.sender}:</strong> {msg.message}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", padding: "5px" }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    style={{ flex: 1, marginRight: "5px" }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && sendMessage()
                    }
                  />
                  <button onClick={sendMessage}>Send</button>
                </div>
              </>
            )}
          </div>

          {/* Editing Cell Modal */}
          {editingCell && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  width: "400px",
                  maxHeight: "90%",
                  overflowY: "auto",
                }}
              >
                <h3>
                  Editing{" "}
                  {editingCell.isDouble
                    ? boardDouble[editingCell.catIndex].category
                    : board[editingCell.catIndex].category}{" "}
                  -{" "}
                  {editingCell.isDouble
                    ? boardDouble[editingCell.catIndex].questions[
                        editingCell.rowIndex
                      ].points
                    : board[editingCell.catIndex].questions[
                        editingCell.rowIndex
                      ].points}
                </h3>

                {/* Edit question content */}
                {["text", "image", "video", "audio"].map((type) => (
                  <div key={type} style={{ marginBottom: "10px" }}>
                    <label>
                      {type.charAt(0).toUpperCase() + type.slice(1)}:
                    </label>
                    <input
                      type="text"
                      value={
                        editingCell.isDouble
                          ? boardDouble[editingCell.catIndex].questions[
                              editingCell.rowIndex
                            ].content[type]
                          : board[editingCell.catIndex].questions[
                              editingCell.rowIndex
                            ].content[type]
                      }
                      onChange={(e) => {
                        const newBoard = editingCell.isDouble
                          ? [...boardDouble]
                          : [...board];
                        newBoard[editingCell.catIndex].questions[
                          editingCell.rowIndex
                        ].content[type] = e.target.value;
                        editingCell.isDouble
                          ? setBoardDouble(newBoard)
                          : setBoard(newBoard);
                      }}
                      style={{ width: "100%" }}
                    />
                    <div style={{ marginTop: "5px" }}>
                      <MediaItem
                        type={type}
                        url={
                          editingCell.isDouble
                            ? boardDouble[editingCell.catIndex].questions[
                                editingCell.rowIndex
                              ].content[type]
                            : board[editingCell.catIndex].questions[
                                editingCell.rowIndex
                              ].content[type]
                        }
                      />
                    </div>
                  </div>
                ))}

                {/* Edit Answer */}
                <div style={{ marginBottom: "10px" }}>
                  <label>Answer:</label>
                  <input
                    type="text"
                    value={
                      editingCell.isDouble
                        ? boardDouble[editingCell.catIndex].questions[
                            editingCell.rowIndex
                          ].answer
                        : board[editingCell.catIndex].questions[
                            editingCell.rowIndex
                          ].answer
                    }
                    onChange={(e) => {
                      const newBoard = editingCell.isDouble
                        ? [...boardDouble]
                        : [...board];
                      newBoard[editingCell.catIndex].questions[
                        editingCell.rowIndex
                      ].answer = e.target.value;
                      editingCell.isDouble
                        ? setBoardDouble(newBoard)
                        : setBoard(newBoard);
                    }}
                    style={{ width: "100%" }}
                  />
                </div>

                <button onClick={() => setEditingCell(null)}>Close</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= JOIN PAGE ================= */}
      {page === "join" && (
        <div>
          <h2>Join Room</h2>
          <div style={{ marginBottom: "10px" }}>
            <label>Name: </label>
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label>Room Code: </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </div>
          <button onClick={joinRoom}>Join</button>
          <button onClick={() => setPage("home")} style={{ marginLeft: "10px" }}>
            ⬅ Back
          </button>
        </div>
      )}
    </div>

    {/* ================= GAME PHASE ================= */}
    {gameStarted && (
      <div>
        <h2>Jeopardy Game</h2>

        {/* Scores */}
        <div style={{ display: "flex", marginTop: "20px" }}>
          <div style={{ width: "200px" }}>
            {playerScores.map((p) => (
              <div key={p.id}>
                {p.name}: {p.score}
              </div>
            ))}
          </div>

          {/* Game Board */}
          <div style={{ flex: 1 }}>
            {currentStage !== "setup" && currentStage !== "final" && renderPlayableBoard(boardPlayable, currentStage)}
          </div>
        </div>


        
        {/*-----------------NEXT STAGE BUTTON--------------------*/}
       {isHost && showNextStageButton && (
         <div style={{ textAlign: "center", marginTop: "20px" }}>
           <button
             onClick={() => {
               if (!currentStage || currentStage === "normal") {
                 // Advance to Double Jeopardy using the prepped host board
                 socket.emit("advanceStage", { roomCode, currentStage: "double", boardPlayable: boardDouble });
                 setBoardPlayable(boardDouble); // host sees the correct board
                 setCurrentStage("double");
               } else {
                 // Advance to Final Jeopardy
                 socket.emit("advanceStage", { roomCode, currentStage: "final" });
                 setCurrentStage("final");
               }

               setShowNextStageButton(false);
             }}
           >
             {currentStage === "normal" ? "Go to Double Jeopardy" : "Go to Final Jeopardy"}
           </button>
         </div>
       )}

        {/* ---------- Question Modal ---------- */}
        <QuestionModal
          question={currentQuestion}
          roomCode={roomCode}
          revealAnswer={() => socket.emit("revealAnswer", { roomCode })}
          allocatePoints={allocatePoints}
          closeModal={closeModal}
          players={playerScores}
          isHost={isHost}
        />


       {/* FINAL JEOPARDY */}
       {currentStage === "final" && (
         <div style={{ textAlign: "center", marginTop: "50px" }}>
           <h2>Final Jeopardy</h2>

           {/* --- Step 0: Category --- */}
           {isHost && !showCategory && (
             <button
               onClick={() => {
                 socket.emit("revealFinalCategory", { roomCode, category: finalJeopardy.category });
                 setShowCategory(true); // host sees immediately
               }}
               style={{ marginBottom: "20px" }}
             >
               Show Category to Players
             </button>
           )}

           {!showCategory ? (
             <p style={{ fontSize: "24px", margin: "20px 0", fontStyle: "italic", color: "#888" }}>
               Waiting for the host to reveal the category...
             </p>
           ) : (
             <p style={{ fontSize: "24px", margin: "20px 0" }}>
               Category: {finalJeopardy.category}
             </p>
           )}

           {/* --- Step 1: Wagers --- */}
           {showCategory && !showFinalQuestion && !isHost && (
             <div>
               {playerWagers[socket.id] === undefined ? (
                 <>
                   <h3>Enter your wager</h3>
                   {playerScores
                     .filter((p) => p.id === socket.id)
                     .map((player) => {
                       const maxWager = Math.max(player.score, 0);
                       return (
                         <div key={player.id} style={{ marginBottom: "10px" }}>
                           <label>{player.name} (Max: {maxWager}): </label>
                           <input
                             type="number"
                             min="0"
                             max={maxWager}
                             value={tempWager ?? ""}
                             onChange={(e) =>
                               setTempWager(Math.min(Math.max(Number(e.target.value), 0), maxWager))
                             }
                           />
                         </div>
                       );
                     })}
                   <button
                     disabled={tempWager === "" || tempWager === null}
                     onClick={() => {
                       setPlayerWagers({ ...playerWagers, [socket.id]: tempWager });
                       socket.emit("submitFinalWager", {
                         roomCode,
                         playerId: socket.id,
                         wager: tempWager,
                       });
                     }}
                   >
                     Submit Wager
                   </button>
                 </>
               ) : (
                 <p>You wagered: {playerWagers[socket.id]}. Waiting for other players...</p>
               )}
             </div>
           )}

           {isHost && showCategory && !showFinalQuestion && (
             <div style={{ marginTop: "20px" }}>
               <button
                 disabled={!allWagersSubmitted}
                 onClick={() => {
                   socket.emit("startFinalJeopardy", {
                     roomCode,
                     question: {
                       category: finalJeopardy.category,
                       question: finalJeopardy.content.text,
                       answer: finalJeopardy.answer,
                       media: {
                         image: finalJeopardy.content.image,
                         video: finalJeopardy.content.video,
                         audio: finalJeopardy.content.audio,
                       },
                     },
                   });
                   setShowFinalQuestion(true);
                 }}
               >
                 Show Question
               </button>
             </div>
           )}

           {/* --- Step 2: Question --- */}
           {showFinalQuestion && !showResults && (
             <div style={{ marginTop: "20px" }}>
               <p style={{ fontSize: "24px", margin: "20px 0" }}>
                 {finalJeopardy?.question || "Question not available"}
               </p>

               {/* Media */}
               {finalJeopardy?.media?.image && (
                 <img
                   src={finalJeopardy.media.image}
                   alt="Final Jeopardy"
                   style={{ maxWidth: "80%", margin: "20px 0" }}
                 />
               )}
               {finalJeopardy?.media?.video && (
                 <video
                   src={finalJeopardy.media.video}
                   controls
                   style={{ maxWidth: "80%", margin: "20px 0" }}
                 />
               )}
               {finalJeopardy?.media?.audio && (
                 <audio src={finalJeopardy.media.audio} controls style={{ margin: "20px 0" }} />
               )}

               {/* Player answer input */}
               {!isHost && (
                 <div style={{ marginTop: "20px" }}>
                   <p>Your wager: {playerWagers[socket.id]}</p>
                   {playerAnswers[socket.id]?.submitted ? (
                     <p>Your answer: "{playerAnswers[socket.id].value}". Waiting for other players...</p>
                   ) : (
                     <>
                       <input
                         type="text"
                         placeholder="Enter your answer"
                         value={playerAnswers[socket.id]?.value ?? ""}
                         onChange={(e) =>
                           setPlayerAnswers({
                             ...playerAnswers,
                             [socket.id]: { value: e.target.value, submitted: false },
                           })
                         }
                       />
                       <button
                         onClick={() => {
                           const answer = playerAnswers[socket.id]?.value || "";
                           setPlayerAnswers({
                             ...playerAnswers,
                             [socket.id]: { value: answer, submitted: true },
                           });
                           socket.emit("submitFinalAnswer", {
                             roomCode,
                             playerId: socket.id,
                             answer,
                           });
                         }}
                       >
                         Submit Answer
                       </button>
                     </>
                   )}
                 </div>
               )}

               {/* Host reveal button */}
               {isHost && allAnswersSubmitted && (
                 <button
                   style={{ marginTop: "20px" }}
                   onClick={() => socket.emit("revealFinalResults", { roomCode })}
                 >
                   Reveal Answer
                 </button>
               )}
             </div>
           )}

           {/* --- Step 3: Final Results --- */}
           {showResults && finalResults && (
             <div style={{ textAlign: "center", marginTop: "20px" }}>
               <h2>Final Results</h2>
               {/* Show the correct answer */}
               <p style={{ fontSize: "20px", margin: "10px 0", fontStyle: "italic" }}>
                 Correct Answer: "{finalJeopardy.answer}"
               </p>
               {finalResults
                 .slice()
                 .sort((a, b) => b.score - a.score)
                 .map((r) => (
                   <div key={r.id} style={{ marginBottom: "10px" }}>
                     <strong>{r.name}</strong> wagered {r.wager}, answered "{r.answer}" →{" "}
                     {r.correct ? "✅ Correct" : "❌ Wrong"} → New Score: {r.score}
                   </div>
                 ))}
             </div>
           )}

         </div>
       )}

       </div>
     )}
    </>
  );
};

export default App;
