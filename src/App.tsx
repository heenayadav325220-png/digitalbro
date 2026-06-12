import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Code,
  PenTool,
  Languages,
  Binary,
  Trash2,
  Settings,
  Plus,
  Search,
  Mic,
  MicOff,
  Image as ImageIcon,
  Volume2,
  VolumeX,
  Copy,
  PlusCircle,
  History,
  User,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  Wand2,
  Sliders,
  X,
  Send,
  RefreshCw,
  Check,
  Cpu,
  Utensils,
  Sun,
  Moon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatSession, Message, Attachment, ChatSettings } from "./types";
import { SYSTEM_PRESETS, STARTER_PROMPTS } from "./presets";
import MarkdownRenderer from "./components/MarkdownRenderer";
import logoUrl from "./assets/images/digital_bro_logo_1781235141803.jpg";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from "firebase/auth";
import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc, 
  query, 
  orderBy,
  onSnapshot 
} from "firebase/firestore";
import { LogOut } from "lucide-react";

// Browser Speech Recognition setup
const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const INITIAL_SESSIONS_KEY = "gemini_chatbot_sessions_v2";
const SETTINGS_KEY = "gemini_chatbot_settings_v1";

// Default welcome chatbot message
const createWelcomeMessage = (): Message => ({
  id: "welcome-msg",
  role: "assistant",
  content: `Yo! मैं हूँ **Digital Bro** - तुम्हारा कड़वा लेकिन सच्चा Business और Critical Thinking Partner।

यहाँ मैं तुम्हें मक्खन लगाने या फ़ालतू की मीठी तारीफ़ें करने नहीं आया हूँ।

तुम्हारा कोई भी **Startup Idea**, **Business Plan**, या **50 Crore** का सपना हो - उसे यहाँ टाइप करो।

मैं तुम्हारे प्लान के सारे **Blind Spots**, **Execution Challenges** और **Logical Flaws** ढूँढ कर तुम्हारे सामने रखूँगा।

नीचे दिए गए **Recommended Prompts** में से कोई एक चुनकर हमारा सीरियस डिस्कशन अभी शुरू करो।`,
  timestamp: Date.now()
});

export default function App() {
  // Chat state management
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [dbSyncLoading, setDbSyncLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Input fields
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Custom states
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCopiedId, setIsCopiedId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("digital_bro_theme");
    return saved === "light" ? "light" : "dark";
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("digital_bro_theme", next);
      return next;
    });
  };

  // General fallback/global settings
  const [settings, setSettings] = useState<ChatSettings>({
    model: "gemini-3.5-flash",
    temperature: 0.7,
    systemInstruction: SYSTEM_PRESETS[0].instruction
  });

  // Speech Recognition hook variables
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync / Listen for Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Ensure user entry exists in Firestore
        try {
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              userId: firebaseUser.uid,
              email: firebaseUser.email || "",
              createdAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error("Failed to register user in Firestore", err);
        }

        // Fetch / load existing session entries
        setDbSyncLoading(true);
        try {
          const sessionsRef = collection(db, "users", firebaseUser.uid, "sessions");
          const q = query(sessionsRef, orderBy("createdAt", "desc"));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            // First time login - initialize first session in Firestore
            const sessionId = "session-" + Date.now();
            const firstSession = {
              id: sessionId,
              userId: firebaseUser.uid,
              title: "First conversation",
              createdAt: Date.now(),
              model: "gemini-3.5-flash",
              temperature: 0.7,
              systemInstruction: SYSTEM_PRESETS[0].instruction
            };
            await setDoc(doc(db, "users", firebaseUser.uid, "sessions", sessionId), firstSession);
            
            const welcomeMsg = createWelcomeMessage();
            await setDoc(doc(db, "users", firebaseUser.uid, "sessions", sessionId, "messages", welcomeMsg.id), welcomeMsg);

            setSessions([{ ...firstSession, messages: [welcomeMsg] }]);
            setActiveSessionId(sessionId);
          } else {
            const loadedSessions: ChatSession[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              loadedSessions.push({
                id: docSnap.id,
                title: data.title,
                createdAt: data.createdAt,
                model: data.model,
                temperature: data.temperature,
                systemInstruction: data.systemInstruction,
                messages: [] // reactively loaded below
              });
            });
            setSessions(loadedSessions);
            setActiveSessionId(loadedSessions[0].id);
          }
        } catch (err) {
          console.error("Firestore sessions fetch error", err);
        } finally {
          setDbSyncLoading(false);
        }
      } else {
        setUser(null);
        setSessions([]);
        setActiveSessionId("");
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sync messages reactively on active session change
  useEffect(() => {
    if (!user || !activeSessionId) return;

    // Check if the current in-memory session already contains loaded messages
    const activeSess = sessions.find((s) => s.id === activeSessionId);
    if (activeSess && activeSess.messages.length > 0) return;

    let isSubscribed = true;
    const messagesPath = `users/${user.uid}/sessions/${activeSessionId}/messages`;
    const messagesRef = collection(db, "users", user.uid, "sessions", activeSessionId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isSubscribed) return;
        const loadedMessages: Message[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loadedMessages.push({
            id: docSnap.id,
            role: data.role as any,
            content: data.content,
            timestamp: data.timestamp,
            attachment: data.attachment
          });
        });

        // Ensure we fall back to default welcome message if empty
        if (loadedMessages.length === 0) {
          loadedMessages.push(createWelcomeMessage());
        }

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === activeSessionId) {
              return { ...s, messages: loadedMessages };
            }
            return s;
          })
        );
      },
      (error) => {
        console.error("Firestore message onSnapshot fetch error:", error);
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [user, activeSessionId]);

  // Initial Settings and native Speech Recognition loader
  useEffect(() => {
    // Load Settings
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }

    // Initialize Native Speech Recognition if available
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Scroll to bottom on response update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, activeSessionId, isGenerating]);

  // Handle browser window resize to auto-collapse sidebar on small displays
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    handleResize(); // run once initially
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Set up standard starting session
  const initializeFirstSession = async () => {
    const sessionId = "session-" + Date.now();
    const defaultSessionMeta = {
      id: sessionId,
      userId: user?.uid || "guest",
      title: "First conversation",
      createdAt: Date.now(),
      model: "gemini-3.5-flash",
      temperature: 0.7,
      systemInstruction: SYSTEM_PRESETS[0].instruction
    };
    const welcomeMsg = createWelcomeMessage();
    const defaultSession: ChatSession = {
      ...defaultSessionMeta,
      messages: [welcomeMsg]
    };
    setSessions([defaultSession]);
    setActiveSessionId(sessionId);

    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid, "sessions", sessionId), defaultSessionMeta);
        await setDoc(doc(db, "users", user.uid, "sessions", sessionId, "messages", welcomeMsg.id), welcomeMsg);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/sessions/${sessionId}`);
      }
    }
  };

  const createNewSession = async (initialQuery?: string, initialPersonaId?: string) => {
    const finalModel = settings.model || "gemini-3.5-flash";
    const finalTemp = settings.temperature || 0.7;
    const persona = SYSTEM_PRESETS.find((p) => p.id === initialPersonaId) || SYSTEM_PRESETS[0];
    
    const sessionId = "session-" + Date.now();
    const newSessionMeta = {
      id: sessionId,
      userId: user?.uid || "guest",
      title: initialQuery 
        ? (initialQuery.length > 25 ? initialQuery.substring(0, 25) + "..." : initialQuery)
        : "New chat session",
      createdAt: Date.now(),
      model: finalModel,
      temperature: finalTemp,
      systemInstruction: persona.instruction
    };

    const welcomeMsg = createWelcomeMessage();
    const newSession: ChatSession = {
      ...newSessionMeta,
      messages: [welcomeMsg]
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(sessionId);

    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid, "sessions", sessionId), newSessionMeta);
        await setDoc(doc(db, "users", user.uid, "sessions", sessionId, "messages", welcomeMsg.id), welcomeMsg);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/sessions/${sessionId}`);
      }
    }

    return newSession;
  };

  const getActiveSession = (): ChatSession | undefined => {
    return sessions.find((s) => s.id === activeSessionId);
  };

  const updateActiveSession = (updater: (session: ChatSession) => ChatSession) => {
    setSessions((prev) => {
      return prev.map((s) => {
        if (s.id === activeSessionId) {
          return updater(s);
        }
        return s;
      });
    });
  };

  const deleteSession = async (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation();
    
    const filtered = sessions.filter((s) => s.id !== idToDelete);
    setSessions(filtered);

    // If active is deleted, switch
    if (activeSessionId === idToDelete) {
      if (filtered.length > 0) {
        setActiveSessionId(filtered[0].id);
      } else {
        await createNewSession();
      }
    }

    if (user) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "sessions", idToDelete));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/sessions/${idToDelete}`);
      }
    }
  };

  const renameSessionTitle = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          return { ...s, title: newTitle.trim() };
        }
        return s;
      })
    );

    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid, "sessions", id), {
          title: newTitle.trim()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/sessions/${id}`);
      }
    }
  };

  // Preset switch triggers
  const applyPresetInstruction = async (instruction: string) => {
    // Current Active session instruction setup
    updateActiveSession((s) => ({
      ...s,
      systemInstruction: instruction
    }));
    // Global defaults update too
    setSettings((prev) => {
      const updated = { ...prev, systemInstruction: instruction };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    });

    if (user && activeSessionId) {
      try {
        await updateDoc(doc(db, "users", user.uid, "sessions", activeSessionId), {
          systemInstruction: instruction
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/sessions/${activeSessionId}`);
      }
    }
  };

  const triggerVoiceListen = () => {
    if (!recognitionRef.current) {
      alert("Browser Speech Recognition API is not supported in this environment.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const handleImageUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Please upload a valid image file.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachment({
          data: reader.result as string,
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopyClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setIsCopiedId(id);
    setTimeout(() => setIsCopiedId(null), 2000);
  };

  const stopActiveSpeech = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  };

  const handleSpeakText = (text: string, messageId: string) => {
    if (!window.speechSynthesis) {
      alert("Speech synthesis is not supported on this browser.");
      return;
    }

    if (speakingMessageId === messageId) {
      stopActiveSpeech();
      return;
    }

    // Stop former speeches
    window.speechSynthesis.cancel();

    // Clean text of markdown before speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, "[Code section skipped]")
      .replace(/[*_`#]/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanText.substring(0, 1000)); // Limit to first 1000 chars for speed
    
    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  // Submit Prompt Handler
  const handleChatSubmit = async (customQuery?: string) => {
    const queryToSend = (customQuery || input).trim();
    if (!queryToSend && !attachment) return;

    // Reset inputs
    setInput("");
    const filePayload = attachment;
    setAttachment(null);
    setIsGenerating(true);

    let currentSession = getActiveSession();
    if (!currentSession) {
      currentSession = await createNewSession(queryToSend);
    }

    // Clean up Welcome message reference if starting fresh conversation
    const messagesHistory = currentSession.messages.filter((m) => m.id !== "welcome-msg");

    // Add user message to state
    const userMessage: Message = {
      id: "msg-" + Date.now(),
      role: "user",
      content: queryToSend,
      timestamp: Date.now(),
      attachment: filePayload || undefined
    };

    // If first real user message, auto-rename chat session
    const isNewConversation = messagesHistory.length === 0;
    const sessionName = isNewConversation 
      ? (queryToSend.length > 30 ? queryToSend.substring(0, 30) + "..." : queryToSend)
      : currentSession.title;

    // Update messages lists
    const updatedMessages = [...messagesHistory, userMessage];

    // Placeholder assistant message to serve streaming chunk responses
    const assistantMessageId = "msg-assistant-" + Date.now();
    const assistantPlaceholderMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now() + 1
    };

    // Apply temporarily on screen
    updateActiveSession((s) => ({
      ...s,
      title: sessionName,
      messages: [...updatedMessages, assistantPlaceholderMessage]
    }));

    try {
      // Connect to full-stack backend endpoint with intelligent retry mechanism
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      
      let response: Response | null = null;
      let attempt = 0;
      const maxClientAttempts = 3;
      let clientDelay = 800; // start with 800ms
      let lastClientError: any = null;

      while (attempt < maxClientAttempts) {
        try {
          if (attempt > 0) {
            // Update the UI placeholder to notify user of retry
            const waitTimeText = (clientDelay / 1000).toFixed(1);
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id === activeSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map((m) => {
                      if (m.id === assistantMessageId) {
                        return {
                          ...m,
                          content: `⏳ **Connection overloaded (Attempt ${attempt + 1}/${maxClientAttempts})...**\nThe service is currently experiencing high demand. Retrying in ${waitTimeText}s.`
                        };
                      }
                      return m;
                    })
                  };
                }
                return s;
              })
            );
            await sleep(clientDelay);
            clientDelay *= 2; // exponential backoff
          }

          response = await fetch("/api/chat/stream", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messages: updatedMessages,
              model: currentSession.model || settings.model,
              temperature: currentSession.temperature || settings.temperature,
              systemInstruction: currentSession.systemInstruction || settings.systemInstruction
            })
          });

          // Check for transient/retryable errors
          if (response.status === 503 || response.status === 504 || response.status === 429) {
            const errJson = await response.clone().json().catch(() => ({}));
            lastClientError = new Error(errJson.error || `HTTP error ${response.status}`);
            attempt++;
            continue;
          }

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP error ${response.status}`);
          }

          break; // Succeeded! Break free from retry loop
        } catch (err: any) {
          lastClientError = err;
          attempt++;
          if (attempt >= maxClientAttempts) {
            throw err;
          }
        }
      }

      if (!response) {
        throw lastClientError || new Error("Failed to connect to full-stack server.");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Connection failed: Server response is non-readable.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let streamedResponseText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Save partial token block

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || !cleanLine.startsWith("data: ")) continue;

          const dataStr = cleanLine.slice(6).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              streamedResponseText += parsed.text;
              
              // Incrementally update the active placeholder message on screen
              setSessions((prev) =>
                prev.map((s) => {
                  if (s.id === activeSessionId) {
                    return {
                      ...s,
                      messages: s.messages.map((m) => {
                        if (m.id === assistantMessageId) {
                          return { ...m, content: streamedResponseText };
                        }
                        return m;
                      })
                    };
                  }
                  return s;
                })
              );
            }
          } catch (e: any) {
            console.error("Stream parse error", e);
            // Append visual error indication
            streamedResponseText += `\n\n*(Error receiving part of stream: ${e?.message || e})*`;
          }
        }
      }

      // If text stream returned absolutely empty
      if (!streamedResponseText) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === activeSessionId) {
              return {
                ...s,
                messages: s.messages.map((m) => {
                  if (m.id === assistantMessageId) {
                    return { ...m, content: "My apologies, no response was returned by the model." };
                  }
                  return m;
                })
              };
            }
            return s;
          })
        );
      }

      // Persist finalized conversation messages and title to Firestore database
      if (user) {
        try {
          const finalSessionId = currentSession.id;
          
          // Set or update the session title if first user message
          if (isNewConversation) {
            await updateDoc(doc(db, "users", user.uid, "sessions", finalSessionId), {
              title: sessionName
            });
          }

          // Store individual User Message in messages subcollection
          await setDoc(
            doc(db, "users", user.uid, "sessions", finalSessionId, "messages", userMessage.id),
            userMessage
          );

          // Store individual finalized Assistant Message in messages subcollection
          const finalAssistantContent = streamedResponseText || "My apologies, no response was returned by the model.";
          const assistantMsg: Message = {
            id: assistantMessageId,
            role: "assistant",
            content: finalAssistantContent,
            timestamp: Date.now()
          };
          await setDoc(
            doc(db, "users", user.uid, "sessions", finalSessionId, "messages", assistantMessageId),
            assistantMsg
          );
        } catch (dbErr) {
          console.error("Firestore message sync error:", dbErr);
        }
      }

    } catch (err: any) {
      console.error(err);
      
      // Update screen message with standard error notice
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: s.messages.map((m) => {
                if (m.id === assistantMessageId) {
                  return {
                    ...m,
                    content: `⚠️ **Request Failed** \n\n${
                      err?.message || "Ensure server is healthy and correct secrets are defined."
                    }`
                  };
                }
                return m;
              })
            };
          }
          return s;
        })
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGlobalSettingsSave = async (newSettings: ChatSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    
    // Also apply to current session parameters
    updateActiveSession((s) => ({
      ...s,
      model: newSettings.model,
      temperature: newSettings.temperature,
      systemInstruction: newSettings.systemInstruction
    }));
    
    setIsSettingsOpen(false);

    if (user && activeSessionId) {
      try {
        await updateDoc(doc(db, "users", user.uid, "sessions", activeSessionId), {
          model: newSettings.model,
          temperature: newSettings.temperature,
          systemInstruction: newSettings.systemInstruction
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/sessions/${activeSessionId}`);
      }
    }
  };

  // Filter sessions by search query
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeSessionObj = getActiveSession();
  const currentPersona = SYSTEM_PRESETS.find(
    (p) => p.instruction === (activeSessionObj?.systemInstruction || settings.systemInstruction)
  ) || SYSTEM_PRESETS[0];

  // Map icon names from presets to standard component
  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case "Sparkles":
        return <Sparkles className="h-4 w-4" />;
      case "Code":
        return <Code className="h-4 w-4" />;
      case "PenTool":
        return <PenTool className="h-4 w-4" />;
      case "Languages":
        return <Languages className="h-4 w-4" />;
      case "Binary":
        return <Binary className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 animate-pulse rounded-2xl overflow-hidden border border-slate-800 shadow-[0_0_25px_rgba(59,130,246,0.25)]">
            <img src={logoUrl} alt="Digital Bro" className="h-full w-full object-cover" />
          </div>
          <h2 className="text-sm font-semibold tracking-wider text-slate-200 animate-pulse">Checking credentials & loading conversations...</h2>
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Zero-Trust Secured Channel</p>
        </div>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 font-sans overflow-hidden">
        {/* Glowing abstract backgrounds */}
        <div className="absolute -top-[40%] -left-[20%] h-[80%] w-[60%] rounded-full bg-blue-950/20 blur-[150px] pointer-events-none" />
        <div className="absolute -bottom-[40%] -right-[20%] h-[80%] w-[60%] rounded-full bg-indigo-950/25 blur-[150px] pointer-events-none" />
        
        <div className="relative z-10 w-full max-w-md px-6 py-12 flex flex-col items-center text-center">
          
          {/* Logo container */}
          <div className="mb-6 p-1 rounded-2xl bg-gradient-to-b from-blue-500 to-indigo-600 shadow-[0_0_40px_rgba(59,130,246,0.3)]">
            <div className="h-24 w-24 rounded-xl overflow-hidden border-2 border-slate-950">
              <img 
                src={logoUrl} 
                alt="Digital Bro Logo" 
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          
          {/* Titles */}
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            Digital Bro
          </h1>
          <p className="mt-2 text-xs font-semibold tracking-widest uppercase text-blue-400 font-mono">
            Critical Thinking AI Partner
          </p>
          
          {/* Inner description pitch */}
          <div className="mt-6 p-5 rounded-2xl border border-slate-900 bg-slate-900/40 backdrop-blur-md text-left text-sm text-slate-400 leading-relaxed max-w-sm">
            <p className="text-center font-medium text-slate-200 mb-2">🚫 No Bullshit, Pure Truth</p>
            I will not validate your grand delusions blindly. Share your business ideas, startup strategies, or 50 Crore dreams. I will tear them open, surface execution challenges, and point out blind spots.
          </div>
          
          {/* Single Google sign-in button */}
          <button
            type="button"
            disabled={isSigningIn}
            onClick={async () => {
              if (isSigningIn) return;
              setIsSigningIn(true);
              setLoginError(null);
              try {
                const provider = new GoogleAuthProvider();
                await signInWithPopup(auth, provider);
              } catch (err: any) {
                console.error("Sign-in error", err);
                
                let friendlyMsg = "";
                if (err?.code === "auth/cancelled-popup-request") {
                  friendlyMsg = "Sign-in popup request was cancelled by browser or another click. If popup loaded in background, please complete it.";
                } else if (err?.code === "auth/popup-closed-by-user") {
                  friendlyMsg = "The Google sign-in window was closed before completing. Please try again.";
                } else if (err?.code === "auth/popup-blocked") {
                  friendlyMsg = "Sign-in popup was blocked by your browser. Please allow popups or use offline mode.";
                } else {
                  friendlyMsg = err?.message || "An unexpected error occurred during Google sign-in.";
                }
                setLoginError(friendlyMsg);
              } finally {
                setIsSigningIn(false);
              }
            }}
            className={`mt-8 flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-md transition-all ${
              isSigningIn 
                ? "opacity-60 cursor-not-allowed bg-slate-100" 
                : "hover:bg-slate-100 active:scale-98 cursor-pointer animate-fade-in"
            }`}
          >
            {isSigningIn ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin text-blue-600 animate-duration-1000" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                {/* Standard flat Google SVG icon */}
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.642.955 14.96 0 12 0 7.354 0 3.307 2.69 1.341 6.6l3.925 3.165z"
                  />
                  <path
                    fill="#4285F4"
                    d="M16.04 15.34c-1.04.59-2.28.93-3.04.93-2.618 0-4.838-1.782-5.632-4.182L3.107 15.3A11.94 11.94 0 0 0 12 24c3.08 0 5.82-1.03 7.82-2.8l-3.78-5.86z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M1.341 17.4A11.954 11.954 0 0 0 12 24c4.61 0 8.52-2.01 10.43-5.22l-4.14-3.23c-.76.71-1.83 1.15-3.25 1.15-2.618 0-4.838-1.782-5.632-4.182L1.341 17.4z"
                  />
                  <path
                    fill="#34A853"
                    d="M23.52 12.27c0-.85-.08-1.68-.22-2.48H12v4.61h6.48c-.28 1.48-1.12 2.73-2.38 3.58l3.78 5.86c2.2-2.03 3.64-5.02 3.64-9.3z"
                  />
                </svg>
                <span>Sign In with Google</span>
              </>
            )}
          </button>

          {/* Continue as Guest (Offline Mode) fallback */}
          <button
            type="button"
            onClick={async () => {
              setIsGuestMode(true);
              await initializeFirstSession();
            }}
            className="mt-4 text-xs font-medium text-slate-400 hover:text-white transition duration-200 underline underline-offset-4 cursor-pointer"
          >
            Continue as Guest (Offline Mode)
          </button>

          {/* Detailed Error and Iframe Guidance Alert Box */}
          {loginError && (
            <div className="mt-6 w-full max-w-sm rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-left text-xs text-rose-200">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-450 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-bold">Google Sign-In Issue</p>
                  <p className="text-[11px] leading-relaxed text-rose-300">{loginError}</p>
                  
                  {window.self !== window.top && (
                    <div className="mt-2.5 p-2 rounded bg-slate-900/60 text-[10.5px] leading-relaxed text-slate-300 font-sans border border-slate-800">
                      <p className="font-semibold text-amber-400 mb-1">💡 Iframe Preview Notice</p>
                      Your browser's cross-origin rules can block popup authentication inside iframes. 
                      Click the <strong className="text-white">"Open in New Tab"</strong> button in the top-right corner of the preview area to run full-screen and resolve this instantly!
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-8 text-[10px] text-slate-700 font-mono tracking-widest uppercase">
            FOR PERSISTENT DATA STORAGE & LOGIN
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${
      theme === "dark" 
        ? "bg-slate-950 text-slate-100" 
        : "bg-[#faf9f5] text-stone-800"
    }`}>
      
      {/* 1. Sidebar Panel */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 310, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className={`flex h-full flex-col border-r relative shrink-0 z-40 transition-colors duration-300 ${
              theme === "dark" 
                ? "border-slate-900 bg-slate-950 text-slate-100" 
                : "border-stone-200/80 bg-stone-100/90 text-stone-800 backdrop-blur-md"
            }`}
          >
            {/* Header: Brand Name */}
            <div className={`flex items-center justify-between px-4 py-4 border-b transition-colors duration-300 ${
              theme === "dark" ? "border-slate-900" : "border-stone-200/80"
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300 overflow-hidden border ${
                  theme === "dark"
                    ? "border-slate-800 bg-slate-900 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                    : "border-stone-200 bg-white shadow-sm"
                }`}>
                  <img
                    src={logoUrl}
                    alt="Digital Bro Logo"
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h1 className={`text-sm font-bold tracking-tight leading-tight ${
                    theme === "dark" ? "text-white" : "text-stone-900"
                  }`}>
                    Digital Bro
                  </h1>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5">
                {/* Theme toggle - small button */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`p-1.5 rounded-lg border transition-all duration-300 active:scale-95 ${
                    theme === "dark"
                      ? "bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-850"
                      : "bg-white border-stone-200 text-amber-500 hover:bg-stone-50 shadow-sm"
                  }`}
                  title={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4 text-stone-700" />}
                </button>

                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className={`lg:hidden rounded-lg p-1.5 transition ${
                    theme === "dark"
                      ? "text-slate-400 hover:bg-slate-900 hover:text-white"
                      : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                  }`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Controls Button - New Chat */}
            <div className="px-3.5 py-3.5">
              <button
                onClick={() => createNewSession()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg active:scale-[98%] transition-all ${
                  theme === "dark"
                    ? "bg-blue-600 text-white shadow-blue-600/10 hover:bg-blue-500"
                    : "bg-indigo-600 text-white shadow-indigo-650/10 hover:bg-indigo-550"
                }`}
              >
                <Plus className="h-4 w-4" />
                <span>New Conversation</span>
              </button>
            </div>

            {/* Session Search bar */}
            <div className="px-3.5 mb-2">
              <div className="relative flex items-center">
                <Search className={`absolute left-3 h-4 w-4 transition-colors ${theme === "dark" ? "text-slate-500" : "text-stone-400"}`} />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none transition-all duration-300 ${
                    theme === "dark"
                      ? "bg-slate-900/60 border border-slate-850 text-white placeholder-slate-500 focus:border-blue-500/50"
                      : "bg-white border border-stone-200 text-stone-850 placeholder-stone-400 focus:border-indigo-500/50 shadow-sm"
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className={`absolute right-2.5 p-1 rounded-full transition-colors ${
                      theme === "dark" 
                        ? "text-slate-400 hover:bg-slate-800 hover:text-white" 
                        : "text-stone-400 hover:bg-stone-200 hover:text-stone-800"
                    }`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Chat list entries */}
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
              <div className={`flex items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                theme === "dark" ? "text-slate-500" : "text-stone-400"
              }`}>
                <span className="flex items-center gap-1.5 font-mono">
                  {dbSyncLoading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  ) : (
                    <History className="h-3.5 w-3.5" />
                  )}
                  HISTORY
                </span>
                <span className="font-mono text-[9px]">
                  {filteredSessions.length} {filteredSessions.length === 1 ? "room" : "rooms"}
                </span>
              </div>

              {filteredSessions.map((room) => {
                const isActive = room.id === activeSessionId;
                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      setActiveSessionId(room.id);
                      if (window.innerWidth < 1024) setIsSidebarOpen(false); // Auto collapse on mobile
                    }}
                    className={`group flex items-center justify-between rounded-xl px-3 py-3 text-xs font-semibold cursor-pointer transition-all ${
                      isActive
                        ? theme === "dark"
                          ? "bg-slate-900 text-white border-l-2 border-blue-500 shadow-[inset_0_1px_5px_rgba(255,255,255,0.02)]"
                          : "bg-indigo-600/10 text-indigo-750 border-l-2 border-indigo-600 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                        : theme === "dark"
                        ? "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                        : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-all overflow-hidden border ${
                        isActive 
                          ? theme === "dark" ? "border-blue-500/30 bg-blue-600/10" : "border-indigo-500/30 bg-indigo-600/10" 
                          : theme === "dark" ? "border-slate-800 bg-slate-850" : "border-stone-200 bg-stone-200"
                      }`}>
                        <img
                          src={logoUrl}
                          alt="Digital Bro Logo Mini"
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <input
                        type="text"
                        value={room.title}
                        onChange={(e) => renameSessionTitle(room.id, e.target.value)}
                        className={`bg-transparent focus:outline-none px-1 py-0.5 rounded truncate select-all font-medium flex-1 w-full text-xs ${
                          theme === "dark" ? "focus:bg-slate-950 text-slate-200" : "focus:bg-white text-stone-800"
                        }`}
                        onClick={(e) => e.stopPropagation()} // Prevent clicking to activate
                      />
                    </div>

                    <button
                      onClick={(e) => deleteSession(e, room.id)}
                      className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg active:scale-90 transition-all ml-1 ${
                        theme === "dark"
                          ? "text-slate-500 hover:text-rose-450 hover:bg-slate-850"
                          : "text-stone-400 hover:text-rose-500 hover:bg-stone-250"
                      }`}
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}

              {filteredSessions.length === 0 && (
                <div className={`py-8 px-4 text-center text-xs italic ${theme === "dark" ? "text-slate-500" : "text-stone-400"}`}>
                  No matching sessions found.
                </div>
              )}
            </div>

            {/* Bottom Section - Instructions Profile card */}
            <div className={`p-3.5 border-t transition-colors duration-300 ${
              theme === "dark" ? "border-slate-900 bg-slate-950" : "border-stone-200/60 bg-[#eedcd2] bg-stone-100"
            }`}>
              <div className={`flex items-center justify-between gap-1.5 p-2 rounded-xl transition-all ${
                theme === "dark" ? "bg-slate-900/40 border border-slate-850" : "bg-white border border-stone-200/80 shadow-sm"
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md font-mono text-xs font-bold leading-normal ${
                    theme === "dark" 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                      : "bg-emerald-600/10 text-emerald-700 border border-emerald-600/20"
                  }`}>
                    AI
                  </div>
                  <div className="truncate">
                    <p className={`text-[11px] font-semibold ${theme === "dark" ? "text-slate-300" : "text-stone-750"}`}>Default Model</p>
                    <p className={`text-[10px] truncate font-mono ${theme === "dark" ? "text-slate-400" : "text-stone-500"}`}>{settings.model}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className={`p-1.5 rounded-lg transition ${
                    theme === "dark" 
                      ? "bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white" 
                      : "bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-900 shadow-sm"
                  }`}
                  title="Configure Model parameters"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Authenticated User Profile Footer */}
            {user && (
              <div className={`p-3.5 border-t transition-colors duration-300 ${
                theme === "dark" ? "border-slate-900 bg-slate-950" : "border-stone-200/60 bg-stone-100"
              }`}>
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt={user.displayName || "User Avatar"} 
                        className="h-8 w-8 rounded-full object-cover border border-slate-750"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm">
                        {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}
                      </div>
                    )}
                    <div className="truncate">
                      <p className={`text-[11px] font-bold truncate leading-tight ${theme === "dark" ? "text-slate-200" : "text-stone-850"}`}>
                        {user.displayName || "Bro"}
                      </p>
                      <p className={`text-[9px] truncate leading-none font-mono ${theme === "dark" ? "text-slate-500" : "text-stone-400"}`}>
                        {user.email}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={async () => {
                      try {
                        await signOut(auth);
                      } catch (err) {
                        console.error("Sign-out failed", err);
                      }
                    }}
                    className={`p-1.5 rounded-lg transition-colors duration-250 ${
                      theme === "dark"
                        ? "hover:bg-slate-900 text-slate-400 hover:text-rose-400"
                        : "hover:bg-stone-200 text-stone-500 hover:text-rose-600"
                    }`}
                    title="Sign Out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Main Workspace Layout */}
      <div className={`flex h-full flex-1 flex-col overflow-hidden relative transition-colors duration-300 ${
        theme === "dark" ? "bg-slate-950" : "bg-[#fcfbf9]"
      }`}>
        
        {/* Workspace Top Header Bar */}
        <header className={`flex h-16 items-center justify-between border-b transition-colors duration-300 px-4 lg:px-6 z-10 ${
          theme === "dark" 
            ? "border-slate-900 bg-slate-950/70 backdrop-blur-md text-white" 
            : "border-stone-200 bg-white/80 backdrop-blur-md text-stone-850"
        }`}>
          
          {/* Collapse sidebar button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`rounded-xl border p-2 transition-all active:scale-95 ${
                theme === "dark"
                  ? "border-slate-850 text-slate-400 hover:bg-slate-900 hover:text-white"
                  : "border-stone-200 text-stone-600 hover:bg-stone-150 hover:text-stone-900 shadow-sm bg-white"
              }`}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {isSidebarOpen ? <ChevronsLeft className="h-4.5 w-4.5" /> : <ChevronsRight className="h-4.5 w-4.5" />}
            </button>

            {/* Current Expert badge display */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-all ${
                theme === "dark"
                  ? "bg-blue-600/10 border border-blue-500/20 text-blue-400"
                  : "bg-indigo-50 border border-indigo-150 text-indigo-700"
              }`}>
                {getPresetIcon(currentPersona.icon)}
                <span className="font-semibold">{currentPersona.name}</span>
              </div>
              <span className={`hidden md:inline ${theme === "dark" ? "text-slate-705 text-slate-700" : "text-stone-300"}`}>|</span>
              <p className={`text-xs font-mono hidden md:inline ${theme === "dark" ? "text-slate-400" : "text-stone-500"}`}>
                Temp: {activeSessionObj?.temperature || settings.temperature}
              </p>
            </div>
          </div>

          {/* Quick preset changer triggers */}
          <div className="flex items-center gap-2">
            
            {/* Quick model selector indicator inside the header */}
            <div className={`hidden sm:flex items-center gap-1 text-xs rounded-xl px-3 py-1.5 font-mono transition-colors ${
              theme === "dark"
                ? "bg-slate-900 border border-slate-850 text-slate-400"
                : "bg-white border border-stone-200 text-stone-600 shadow-sm"
            }`}>
              <Cpu className="h-3.5 w-3.5 text-blue-400" />
              <span>{activeSessionObj?.model || settings.model}</span>
            </div>

            {/* Main Header Theme Toggle in case sidebar is hidden */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-all active:scale-95 ${
                theme === "dark"
                  ? "bg-slate-900 border-slate-850 text-amber-400 hover:bg-slate-800"
                  : "bg-white border border-stone-200 text-amber-505 hover:bg-stone-50 shadow-sm"
              }`}
              title={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5 animate-spin-slow" /> : <Moon className="h-4.5 w-4.5 text-stone-700" />}
            </button>

            {/* System settings trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 ${
                theme === "dark"
                  ? "border-slate-850 text-slate-305 text-slate-300 hover:bg-slate-900 hover:text-white"
                  : "border-stone-200 text-stone-700 bg-white hover:bg-stone-102 hover:bg-stone-50 hover:text-stone-900 shadow-sm"
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span className="hidden sm:inline">Parameters</span>
            </button>
          </div>
        </header>

        {/* 3. Messages Window */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8 space-y-6">
          <div className="mx-auto max-w-3xl space-y-6">
            
            {/* Current messages stack */}
            {activeSessionObj && activeSessionObj.messages.map((message) => {
              const isUser = message.role === "user";

              if (!isUser) {
                // PREMIUM CHATGPT-STYLE AI DOCUMENT RESPONSE LAYOUT
                return (
                  <div
                    key={message.id}
                    className="w-full py-5 border-b border-transparent transition-all duration-300"
                  >
                    <div className="flex flex-col w-full">
                      {/* Avatar & Header above the response */}
                      <div className="flex items-center gap-3 mb-3.5 px-0.5">
                        <div className={`flex h-7.5 w-7.5 shrink-0 select-none items-center justify-center rounded-lg overflow-hidden border ${
                          theme === "dark" 
                            ? "bg-slate-900 border-slate-800/80 shadow-md" 
                            : "bg-stone-50 border-stone-200/60 shadow-sm"
                        }`}>
                          <img
                            src={logoUrl}
                            alt="Digital Bro Logo"
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-xs font-bold tracking-tight ${
                            theme === "dark" ? "text-slate-100" : "text-stone-850"
                          }`}>
                            {currentPersona.name}
                          </span>
                          <span className={`text-[10px] font-mono ${
                            theme === "dark" ? "text-slate-500" : "text-stone-400"
                          }`}>
                            {new Date(message.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Content directly on the page, full width */}
                      <div className="w-full pl-0.5 pr-1 py-0.5">
                        {/* Enclosed inline uploaded file image */}
                        {message.attachment && (
                          <div className={`mb-4 max-w-sm overflow-hidden rounded-xl border p-1 ${
                            theme === "dark" ? "border-slate-850 bg-slate-950" : "border-stone-200 bg-stone-50"
                          }`}>
                            <img
                              src={message.attachment.data}
                              alt="Visual context metadata"
                              className="max-h-64 w-full object-contain rounded-lg"
                            />
                            <p className={`mt-2 text-center text-[10px] font-mono uppercase tracking-wider ${
                              theme === "dark" ? "text-slate-500" : "text-stone-550"
                            }`}>
                              📎 {message.attachment.mimeType.split("/")[1]} image
                            </p>
                          </div>
                        )}

                        {message.content ? (
                          <div className={`prose max-w-none text-sm md:text-[14.5px] leading-relaxed tracking-normal transition-colors duration-200 ${
                            theme === "dark" ? "text-slate-255 text-slate-200" : "text-stone-800"
                          }`}>
                            <MarkdownRenderer content={message.content} theme={theme} isUser={false} />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 py-1.5">
                            <div className="flex space-x-1.5">
                              <div className={`h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s] ${
                                theme === "dark" ? "bg-blue-400" : "bg-indigo-600"
                              }`}></div>
                              <div className={`h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s] ${
                                theme === "dark" ? "bg-blue-400" : "bg-indigo-600"
                              }`}></div>
                              <div className={`h-2 w-2 animate-bounce rounded-full ${
                                theme === "dark" ? "bg-blue-400" : "bg-indigo-600"
                              }`}></div>
                            </div>
                            <span className={`text-xs font-mono italic animate-pulse ${
                              theme === "dark" ? "text-slate-400" : "text-stone-500"
                            }`}>Thinking...</span>
                          </div>
                        )}
                      </div>

                      {/* Quick helper controls under the response feedback */}
                      {message.content && (
                        <div className="flex items-center gap-2 mt-4 px-0.5">
                          <button
                            onClick={() => handleCopyClipboard(message.content, message.id)}
                            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold transition active:scale-95 ${
                              theme === "dark"
                                ? "bg-slate-905 hover:bg-slate-900 border border-slate-850/60 text-slate-400 hover:text-white"
                                : "bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-900 shadow-sm"
                            }`}
                            title="Copy text to clipboard"
                          >
                            {isCopiedId === message.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-500" />
                                <span className="text-emerald-500 font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span className="font-sans">Copy</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleSpeakText(message.content, message.id)}
                            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold transition active:scale-95 ${
                              speakingMessageId === message.id
                                ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                : theme === "dark"
                                ? "bg-slate-905 hover:bg-slate-900 border border-slate-850/60 text-slate-400 hover:text-white"
                                : "bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-900 shadow-sm"
                            }`}
                            title={speakingMessageId === message.id ? "Stop voice synthesizer" : "Listen via voice synthesizer"}
                          >
                            {speakingMessageId === message.id ? (
                              <>
                                <VolumeX className="h-3 w-3 text-rose-500" />
                                <span className="text-rose-500 font-sans font-semibold">Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" />
                                <span className="font-sans">Speak</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // MODERNIZE USER BUBBLE CHAT MESSAGE
              return (
                <div
                  key={message.id}
                  className="flex gap-3.5 justify-end w-full py-1.5"
                >
                  <div className="flex flex-col items-end max-w-[85%]">
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        theme === "dark" ? "text-slate-500" : "text-stone-500"
                      }`}>
                        You
                      </span>
                      <span className={`text-[10px] font-mono ${
                        theme === "dark" ? "text-slate-600" : "text-stone-400"
                      }`}>
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    </div>

                    <div
                      className={`relative rounded-2xl border px-4.5 py-3 transition-all duration-300 text-sm leading-relaxed ${
                        theme === "dark"
                          ? "bg-slate-900 border-slate-800 text-slate-100 rounded-tr-none"
                          : "bg-indigo-650 bg-indigo-600 border-transparent text-white rounded-tr-none shadow-[0_4px_12px_rgba(79,70,229,0.15)]"
                      }`}
                    >
                      {message.attachment && (
                        <div className={`mb-3 max-w-[280px] overflow-hidden rounded-lg border p-1 ${
                          theme === "dark" ? "border-slate-850 bg-slate-950" : "border-stone-200 bg-stone-50"
                        }`}>
                          <img
                            src={message.attachment.data}
                            alt="Visual context metadata"
                            className="max-h-56 w-full object-contain rounded"
                          />
                          <p className={`mt-1.5 text-center text-[10px] font-mono uppercase ${
                            theme === "dark" ? "text-slate-500" : "text-stone-500"
                          }`}>
                            📎 {message.attachment.mimeType.split("/")[1]} image
                          </p>
                        </div>
                      )}

                      <MarkdownRenderer content={message.content} theme={theme} isUser={true} />
                    </div>
                  </div>

                  {/* Slick User avatar icon */}
                  <div className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border transition-all ${
                    theme === "dark" 
                      ? "bg-slate-900 border-slate-800/80 text-slate-300 shadow-md"
                      : "bg-indigo-50 border-indigo-100 text-indigo-700 shadow-sm"
                  }`}>
                    <User className="h-4.5 w-4.5" />
                  </div>
                </div>
              );
            })}

            {/* Starter templates carousel when chat is empty or contains only welcome */}
            {activeSessionObj && activeSessionObj.messages.every((m) => m.id === "welcome-msg") && (
              <div className={`space-y-4 pt-4 border-t transition-colors duration-300 ${
                theme === "dark" ? "border-slate-900" : "border-stone-200"
              }`}>
                <div className={`flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider ${
                  theme === "dark" ? "text-slate-500" : "text-stone-500"
                }`}>
                  <Wand2 className={`h-3.5 w-3.5 ${theme === "dark" ? "text-blue-400" : "text-indigo-600"}`} /> Recommended Prompts
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {STARTER_PROMPTS.map((prompt, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        // Apply persona structure if applicable
                        if (prompt.presetId) {
                          const persona = SYSTEM_PRESETS.find((p) => p.id === prompt.presetId);
                          if (persona) {
                            applyPresetInstruction(persona.instruction);
                          }
                        }
                        handleChatSubmit(prompt.query);
                      }}
                      className="group p-4 bg-slate-900/40 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 rounded-2xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/5 text-blue-400 border border-blue-500/10 group-hover:bg-blue-600/10 transition-colors">
                          {prompt.iconName === "Cpu" && <Cpu className="h-4 w-4" />}
                          {prompt.iconName === "Code" && <Code className="h-4 w-4" />}
                          {prompt.iconName === "PenTool" && <PenTool className="h-4 w-4" />}
                          {prompt.iconName === "Utensils" && <Utensils className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">
                            {prompt.label}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                             {prompt.query}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
          </div>
        </div>

        {/* 4. Core Bottom Input Bar Panel */}
        <div className={`border-t p-4 md:px-6 pb-6 transition-colors duration-300 ${
          theme === "dark" ? "border-slate-900 bg-slate-950" : "border-stone-200/50 bg-white"
        }`}>
          <div className="mx-auto max-w-3xl">
            
            {/* Image attachment preview block */}
            {attachment && (
              <div className={`mb-3 flex items-center justify-between rounded-xl p-2.5 max-w-xs relative group border transition-colors duration-300 ${
                theme === "dark" ? "bg-slate-900 border-slate-800" : "bg-stone-50 border-stone-200"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 overflow-hidden rounded border flex items-center justify-center transition-colors duration-300 ${
                    theme === "dark" ? "border-slate-805 bg-slate-950" : "border-stone-200 bg-white"
                  }`}>
                    <img
                      src={attachment.data}
                      alt="Attachment Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold truncate max-w-[150px] ${theme === "dark" ? "text-slate-200" : "text-stone-850"}`}>
                      Selected image
                    </p>
                    <p className={`text-[10px] font-mono ${theme === "dark" ? "text-slate-400" : "text-stone-500"}`}>
                      {attachment.mimeType.split("/")[1].toUpperCase()} attachment
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className={`rounded-full p-1 transition-colors ${
                    theme === "dark" 
                      ? "bg-slate-800 hover:bg-slate-705 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white" 
                      : "bg-stone-200 hover:bg-stone-300 text-stone-600 hover:text-stone-900"
                  }`}
                  title="Remove image attachment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Input Bar Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleChatSubmit();
              }}
              className={`relative flex flex-col rounded-2xl border transition-all duration-300 shadow-md ${
                theme === "dark"
                  ? "border-slate-850 bg-slate-900/60 focus-within:border-blue-500/50"
                  : "border-stone-203 border-stone-200 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.02)] focus-within:border-indigo-500/50"
              }`}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit();
                  }
                }}
                rows={2}
                placeholder={
                  isListening
                    ? "LISTENING... Speak clearly into your microphone."
                    : "Message Gemini Chatbot... (Shift + Enter for new lines)"
                }
                className={`w-full resize-none bg-transparent px-4 py-3.5 text-sm focus:outline-none focus:ring-0 min-h-[56px] transition-colors duration-300 ${
                  theme === "dark" ? "text-slate-100 placeholder-slate-500" : "text-stone-850 placeholder-stone-400"
                }`}
              />

              {/* Interaction Bar Toolbar */}
              <div className={`flex h-12 items-center justify-between border-t px-3 py-2 rounded-b-2xl transition-colors duration-300 ${
                theme === "dark" 
                  ? "border-slate-850/60 bg-slate-900/40" 
                  : "border-stone-150 bg-[#faf9f6]/90 bg-stone-50"
              }`}>
                
                {/* Media attachments triggers */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageUploadChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-lg p-2 transition active:scale-95 ${
                      theme === "dark"
                        ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                        : "text-stone-500 hover:bg-stone-200/50 hover:text-stone-900"
                    }`}
                    title="Upload image"
                  >
                    <ImageIcon className="h-4.5 w-4.5" />
                  </button>

                  {/* Dictation voice input */}
                  <button
                    type="button"
                    onClick={triggerVoiceListen}
                    className={`rounded-lg p-2 transition active:scale-95 ${
                      isListening
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        : theme === "dark"
                        ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                        : "text-stone-500 hover:bg-stone-200/50 hover:text-stone-900"
                    }`}
                    title={isListening ? "Stop listening" : "Dictate message"}
                  >
                    {isListening ? <MicOff className="h-4.5 w-4.5 animate-pulse" /> : <Mic className="h-4.5 w-4.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeSessionObj) {
                        updateActiveSession((s) => ({
                          ...s,
                          messages: [createWelcomeMessage()]
                        }));
                        stopActiveSpeech();
                      }
                    }}
                    className={`rounded-lg p-2 transition active:scale-95 ${
                      theme === "dark"
                        ? "text-slate-400 hover:bg-slate-800 hover:text-slate-250 hover:text-slate-200"
                        : "text-stone-500 hover:bg-stone-200/50 hover:text-stone-900"
                    }`}
                    title="Clear history"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>

                {/* Submit Send Button */}
                <div className="flex items-center gap-2">
                  {isGenerating ? (
                    <div className={`flex h-8 w-16 items-center justify-center rounded-xl py-1 ${
                      theme === "dark" 
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/10" 
                        : "bg-indigo-50 border border-indigo-150 text-indigo-700"
                    }`}>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() && !attachment}
                      className={`flex h-8.5 items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-30 disabled:hover:scale-100 active:scale-95 cursor-pointer ${
                        theme === "dark"
                          ? "bg-blue-600 hover:bg-blue-500 disabled:hover:bg-blue-600"
                          : "bg-indigo-650 bg-indigo-600 hover:bg-indigo-700 disabled:hover:bg-indigo-600"
                      }`}
                    >
                      <span>Send</span>
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

              </div>
            </form>
            
          </div>
        </div>

      </div>

      {/* 5. Custom Modal - Parameter Dialog */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`p-6 rounded-2xl w-full max-w-md shadow-2xl relative select-none border transition-all duration-300 ${
                theme === "dark" 
                  ? "bg-slate-900 border-slate-800 text-white" 
                  : "bg-white border-stone-200 text-stone-850"
              }`}
            >
              {/* Close Button */}
              <button
                onClick={() => setIsSettingsOpen(false)}
                className={`absolute right-4 top-4 p-1 rounded-full transition-colors ${
                  theme === "dark" ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-stone-400 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 ml-1 mb-4">
                <Sliders className={`h-5 w-5 ${theme === "dark" ? "text-blue-400" : "text-indigo-600"}`} />
                <h2 className={`text-md font-bold uppercase tracking-tight ${theme === "dark" ? "text-white" : "text-stone-850"}`}>
                  Model Parameters
                </h2>
              </div>

              <div className="space-y-5">
                
                {/* Mode Select Form */}
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                    theme === "dark" ? "text-slate-400" : "text-stone-500"
                  }`}>
                    LLM Engine / Model
                  </label>
                  <select
                    value={settings.model}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    className={`w-full rounded-xl p-2.5 text-sm focus:outline-none transition-colors duration-300 font-mono ${
                      theme === "dark" 
                        ? "bg-slate-950 border border-slate-850 text-slate-200 focus:border-blue-500/50" 
                        : "bg-stone-50 border border-stone-200 text-stone-800 focus:border-indigo-500/50"
                    }`}
                  >
                    <option value="gemini-3.5-flash">gemini-3.5-flash (Fast, Default)</option>
                    <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Highly Logical)</option>
                  </select>
                </div>

                {/* Temperature slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={`text-xs font-bold uppercase tracking-wider ${
                      theme === "dark" ? "text-slate-400" : "text-stone-500"
                    }`}>
                      Temperature
                    </label>
                    <span className={`text-xs font-mono font-bold ${
                      theme === "dark" ? "text-blue-400" : "text-indigo-600"
                    }`}>
                      {settings.temperature}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.5"
                    step="0.1"
                    value={settings.temperature}
                    onChange={(e) =>
                      setSettings({ ...settings, temperature: parseFloat(e.target.value) })
                    }
                    className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${
                      theme === "dark" ? "bg-slate-950 accent-blue-500" : "bg-stone-200 accent-indigo-600"
                    }`}
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>Deterministic (0.0)</span>
                    <span>Creative (1.5)</span>
                  </div>
                </div>

                {/* Presets List toggles */}
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                    theme === "dark" ? "text-slate-400" : "text-stone-500"
                  }`}>
                     System Prompt Presets
                  </label>
                  <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto px-0.5">
                    {SYSTEM_PRESETS.map((preset) => {
                      const isSelected = settings.systemInstruction === preset.instruction;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => applyPresetInstruction(preset.instruction)}
                          className={`flex items-center justify-between p-2 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
                            isSelected
                              ? theme === "dark"
                                ? "bg-blue-600/5 border-blue-500/40 shadow-sm"
                                : "bg-indigo-50/50 border-indigo-500/40 shadow-sm"
                              : theme === "dark"
                              ? "bg-slate-950/50 border-slate-850 hover:bg-slate-950 hover:border-slate-800"
                              : "bg-stone-50 border-stone-200 hover:bg-stone-100 hover:border-stone-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-all duration-300 ${
                              isSelected 
                                ? theme === "dark" ? "text-blue-400 bg-blue-600/10" : "text-indigo-600 bg-indigo-50" 
                                : theme === "dark" ? "text-slate-500 bg-slate-900" : "text-stone-505 text-stone-500 bg-stone-100"
                            }`}>
                              {getPresetIcon(preset.icon)}
                            </div>
                            <div className="truncate">
                              <p className={`text-[11px] font-semibold transition-colors duration-305 ${
                                isSelected 
                                  ? theme === "dark" ? "text-blue-400" : "text-indigo-700 font-bold" 
                                  : theme === "dark" ? "text-slate-205 text-slate-200" : "text-stone-800"
                              }`}>{preset.name}</p>
                            </div>
                          </div>
                          {isSelected && <Check className={`h-3.5 w-3.5 ${theme === "dark" ? "text-blue-400" : "text-indigo-600"}`} />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Custom System Instruction text block */}
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                    theme === "dark" ? "text-slate-400" : "text-stone-505 text-stone-500"
                  }`}>
                    Custom System Instructions
                  </label>
                  <textarea
                    rows={3}
                    value={settings.systemInstruction}
                    onChange={(e) =>
                      setSettings({ ...settings, systemInstruction: e.target.value })
                    }
                    placeholder="Give the chatbot specific rules or a creative persona..."
                    className={`w-full rounded-xl p-2.5 text-xs focus:outline-none transition-colors duration-300 ${
                      theme === "dark" 
                        ? "bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-600 focus:border-blue-500/50" 
                        : "bg-stone-50 border border-stone-200 text-stone-850 placeholder-stone-400 focus:border-indigo-500/50"
                    }`}
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={() => handleGlobalSettingsSave(settings)}
                  className={`w-full rounded-xl py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg active:scale-98 transition-all cursor-pointer ${
                    theme === "dark" ? "bg-blue-600 hover:bg-blue-500" : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  Save Parameters
                </button>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
