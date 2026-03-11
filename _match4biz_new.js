function Match4BizPage({ onBack, clients, user }) {
  const [view, setView] = useState("dashboard");
  const [pgC, setPgC] = useState(false); const pgRef = useRef(null);
  const [selMatch, setSelMatch] = useState(null);
  const [filter, setFilter] = useState("all");
  const [msgInput, setMsgInput] = useState("");
  const [sugIdx, setSugIdx] = useState(0);
  const { showToast, ToastEl } = useToast();

  /* ── Segment compatibility matrix ── */
  const COMPAT = {
    "Imobiliário":["Arquitetura","Decoração","Construção","Financeiro","Mudanças","Seguros"],
    "Estética":["Cosméticos","Moda","Fitness","Saúde","Bem-estar","Fotografia"],
    "Tecnologia":["E-commerce","Marketing Digital","Educação","Consultoria","Startups","SaaS"],
    "Alimentação":["Delivery","Distribuição","Embalagens","Eventos","Fornecedor","Bebidas"],
    "Saúde":["Estética","Farmácia","Fitness","Bem-estar","Nutrição","Suplementos"],
    "Fitness":["Saúde","Nutrição","Suplementos","Moda Esportiva","Estética","Bem-estar"],
    "Moda":["Estética","Fotografia","E-commerce","Acessórios","Calçados","Joias"],
    "Educação":["Tecnologia","Papelaria","Livros","Cursos","Idiomas","Treinamento"],
    "Advocacia":["Contabilidade","Financeiro","Imobiliário","Consultoria","Seguros","RH"],
    "Contabilidade":["Advocacia","Financeiro","Consultoria","Seguros","RH","Startups"],
    "Pet":["Veterinário","Alimentação Animal","Pet Shop","Banho e Tosa","Acessórios Pet","Adestramento"],
    "Automotivo":["Seguros","Peças","Oficina","Estética Automotiva","Locação","Combustível"],
    "Restaurante":["Fornecedor","Delivery","Bebidas","Eventos","Alimentação","Embalagens"],
    "Varejo":["E-commerce","Distribuição","Logística","Marketing","Fornecedor","Embalagens"],
    "Turismo":["Hotelaria","Gastronomia","Transporte","Eventos","Fotografia","Aventura"],
  };

  /* ── Calculate match probability between two clients ── */
  const calcMatchProb = (c1, c2) => {
    let score = 0;
    const s1 = (c1.segment||"").toLowerCase(), s2 = (c2.segment||"").toLowerCase();
    // Segment compatibility (0-40 points)
    const compat1 = COMPAT[c1.segment] || [];
    const compat2 = COMPAT[c2.segment] || [];
    if (compat1.some(s => s.toLowerCase() === s2)) score += 40;
    else if (compat2.some(s => s.toLowerCase() === s1)) score += 35;
    else if (s1 !== s2) score += 10; // Different segments have some potential
    else score += 5; // Same segment = competition, low match
    // Both active (0-15 points)
    if (c1.status === "ativo" && c2.status === "ativo") score += 15;
    else if (c1.status === "ativo" || c2.status === "ativo") score += 8;
    // Client quality scores (0-20 points)
    const avgScore = ((c1.score||50) + (c2.score||50)) / 2;
    score += Math.round((avgScore / 100) * 20);
    // Plan level bonus (0-15 points)
    const planScore = { Premium:15, Growth:12, Essencial:8, Traction:5 };
    score += Math.round(((planScore[c1.plan]||5) + (planScore[c2.plan]||5)) / 2);
    // Location bonus (0-10 points) — same city = bonus
    const city1 = (c1.address||"").split("-").pop()?.trim()?.split("/")[0]?.trim();
    const city2 = (c2.address||"").split("-").pop()?.trim()?.split("/")[0]?.trim();
    if (city1 && city2 && city1.toLowerCase() === city2.toLowerCase()) score += 10;
    return Math.min(100, Math.max(5, score));
  };
