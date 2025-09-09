document.addEventListener('DOMContentLoaded', () => {

    // Módulo de Estado da Aplicação e Lógica Principal
    const App = {
        state: {
            currentUser: { observador: null, supervisor: null },
            damageType: 'scratch',
            damageMarkers: [],
            signaturePad: null,
            vehicleImageBase64: null,
        },
        
        init() {
            this.state.currentUser.observador = sessionStorage.getItem('observador');
            this.state.currentUser.supervisor = sessionStorage.getItem('supervisor');

            if (this.state.currentUser.observador && this.state.currentUser.supervisor) {
                UI.showScreen('app');
                UI.updateUserInfo(this.state.currentUser);
                UI.startDateTimeUpdates();
            } else {
                UI.showScreen('login');
            }

            this.initSignaturePad();
            this.initIMask();
            this.bindEvents();
        },

        initSignaturePad() {
            const canvas = document.getElementById('signaturePad');
            function resizeCanvas() {
                const ratio = Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                canvas.getContext("2d").scale(ratio, ratio);
                App.state.signaturePad.clear();
            }
            window.addEventListener("resize", resizeCanvas);
            this.state.signaturePad = new SignaturePad(canvas, { backgroundColor: 'rgb(255, 255, 255)' });
            resizeCanvas();
        },
        
        initIMask() {
            // A máscara do telefone continua, pois é útil e não apresenta problemas.
            IMask(document.getElementById('telefone'), { 
                mask: '(00) 00000-0000',
                lazy: true 
            });
        },

        bindEvents() {
            document.getElementById('loginForm').addEventListener('submit', this.handleLogin.bind(this));
            document.getElementById('checklistForm').addEventListener('submit', (e) => e.preventDefault());
            document.getElementById('logoutBtn').addEventListener('click', this.handleLogout.bind(this));
            
            // O botão agora se chama "Salvar Checklist" e tem uma nova função
            const saveBtn = document.getElementById('generatePdfBtn');
            saveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Salvar Checklist no Drive';
            saveBtn.addEventListener('click', () => PDF.generateAndUpload(this.getChecklistData()));
            
            document.getElementById('clearFormBtn').addEventListener('click', this.handleClearForm.bind(this));
            document.getElementById('saveDraftBtn').addEventListener('click', this.handleSaveDraft.bind(this));
            document.getElementById('loadDraftBtn').addEventListener('click', this.handleLoadDraft.bind(this));
            document.getElementById('clearSignatureBtn').addEventListener('click', () => this.state.signaturePad.clear());
            document.getElementById('vehicleUpload').addEventListener('click', () => document.getElementById('vehicleImageInput').click());
            document.getElementById('vehicleImageInput').addEventListener('change', this.handleImageUpload.bind(this));
            document.querySelector('.damage-legend').addEventListener('click', this.handleDamageTypeSelect.bind(this));
        },

        handleLogin(e) {
            e.preventDefault();
            const observador = document.getElementById('observador').value;
            const supervisor = document.getElementById('supervisor').value;
            
            if (observador && supervisor) {
                this.state.currentUser = { observador, supervisor };
                sessionStorage.setItem('observador', observador);
                sessionStorage.setItem('supervisor', supervisor);
                App.init();
            } else {
                UI.showToast('Por favor, preencha todos os campos.', 'error');
            }
        },

        handleLogout() {
            UI.showConfirm('Deseja realmente sair? Dados não salvos serão perdidos.', () => {
                sessionStorage.clear();
                window.location.reload();
            });
        },
        
        handleClearForm() {
            UI.showConfirm('Tem certeza que deseja limpar todos os campos do formulário?', () => {
                document.getElementById('checklistForm').reset();
                this.state.damageMarkers = [];
                this.state.signaturePad.clear();
                this.state.vehicleImageBase64 = null;
                UI.renderDamage(this.state.damageMarkers);
                UI.resetVehicleUploader();
                UI.showToast('Formulário limpo com sucesso.', 'success');
            });
        },

        handleSaveDraft() {
            const data = this.getChecklistData();
            Storage.save(data);
            UI.showToast('Rascunho salvo com sucesso!', 'success');
        },

        handleLoadDraft() {
            const drafts = Storage.getAll();
            if (drafts.length === 0) {
                UI.showToast('Nenhum rascunho encontrado.', 'info');
                return;
            }
            UI.showDraftsModal(drafts, (key) => {
                const data = Storage.get(key);
                if(data) {
                    this.loadChecklistData(data);
                    UI.showToast('Rascunho carregado!', 'success');
                }
            });
        },

        handleImageUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.state.vehicleImageBase64 = e.target.result;
                    UI.displayVehicleImage(this.state.vehicleImageBase64, this.handleAddDamage.bind(this));
                };
                reader.readAsDataURL(file);
            }
        },

        handleDamageTypeSelect(e) {
            const legendItem = e.target.closest('.legend-item');
            if (legendItem) {
                document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('active'));
                legendItem.classList.add('active');
                this.state.damageType = legendItem.dataset.type;
            }
        },

        handleAddDamage(event) {
            const rect = event.target.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            
            UI.showPrompt('Descreva o dano:', (description) => {
                if (description !== null) {
                    const marker = {
                        id: Date.now(),
                        type: this.state.damageType,
                        x, y,
                        description: description || 'Dano não especificado'
                    };
                    this.state.damageMarkers.push(marker);
                    UI.renderDamage(this.state.damageMarkers, this.handleRemoveDamage.bind(this));
                }
            });
        },

        handleRemoveDamage(id) {
            this.state.damageMarkers = this.state.damageMarkers.filter(m => m.id !== id);
            UI.renderDamage(this.state.damageMarkers, this.handleRemoveDamage.bind(this));
        },
        
        getChecklistData() {
            const form = document.getElementById('checklistForm');
            const formData = new FormData(form);
            const data = {};
            const keys = new Set(Array.from(formData.keys()));

            for (const key of keys) {
                const values = formData.getAll(key);
                data[key] = values.length > 1 ? values : values[0];
            }
            
            data.observador = this.state.currentUser.observador;
            data.supervisor = this.state.currentUser.supervisor;
            data.damageMarkers = this.state.damageMarkers;
            data.vehicleImageBase64 = this.state.vehicleImageBase64;
            data.signatureBase64 = this.state.signaturePad.isEmpty() ? null : this.state.signaturePad.toDataURL();
            
            return data;
        },

        loadChecklistData(data) {
            document.getElementById('checklistForm').reset();
            const form = document.getElementById('checklistForm');
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    const elements = form.elements[key];
                    if (elements) {
                        const type = elements.length ? elements[0].type : elements.type;
                        if (type === 'radio') {
                            const radio = document.querySelector(`input[name="${key}"][value="${data[key]}"]`);
                            if (radio) radio.checked = true;
                        } else if (type === 'checkbox') {
                            const values = Array.isArray(data[key]) ? data[key] : [data[key]];
                            document.querySelectorAll(`input[name="${key}"]`).forEach(cb => {
                                cb.checked = values.includes(cb.value);
                            });
                        } else {
                            elements.value = data[key];
                        }
                    }
                }
            }
            this.state.damageMarkers = data.damageMarkers || [];
            this.state.vehicleImageBase64 = data.vehicleImageBase64 || null;
            if(data.signatureBase64) this.state.signaturePad.fromDataURL(data.signatureBase64);
            if(this.state.vehicleImageBase64) UI.displayVehicleImage(this.state.vehicleImageBase64, this.handleAddDamage.bind(this));
            
            UI.renderDamage(this.state.damageMarkers, this.handleRemoveDamage.bind(this));
        }
    };

    const UI = {
        showScreen(screenName) {
            document.getElementById('loginScreen').style.display = screenName === 'login' ? 'flex' : 'none';
            document.getElementById('appScreen').style.display = screenName === 'app' ? 'block' : 'none';
        },
        updateUserInfo({ observador, supervisor }) {
            document.getElementById('currentUser').textContent = `Obs: ${observador} | Sup: ${supervisor}`;
        },
        startDateTimeUpdates() {
            const update = () => {
                const now = new Date();
                document.getElementById('currentDate').textContent = now.toLocaleDateString('pt-BR');
                document.getElementById('currentTime').textContent = now.toLocaleTimeString('pt-BR');
            };
            update();
            setInterval(update, 1000);
        },
        displayVehicleImage(imageBase64, addDamageCallback) {
            const uploadDiv = document.getElementById('vehicleUpload');
            uploadDiv.innerHTML = `<img src="${imageBase64}" alt="Veículo" class="vehicle-image">`;
            uploadDiv.classList.add('has-image');
            uploadDiv.querySelector('.vehicle-image').addEventListener('click', addDamageCallback);
        },
        resetVehicleUploader() {
            const uploadDiv = document.getElementById('vehicleUpload');
            uploadDiv.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Clique para fazer upload da imagem do veículo</p>
                <small>Formatos aceitos: PNG, JPG, JPEG</small>
                <input type="file" id="vehicleImageInput" accept="image/*" style="display: none;">`;
            uploadDiv.classList.remove('has-image');
            document.getElementById('vehicleImageInput').addEventListener('change', App.handleImageUpload.bind(App));
        },
        renderDamage(markers, removeCallback) {
            const container = document.getElementById('vehicleContainer');
            container.querySelectorAll('.damage-marker').forEach(m => m.remove());
            markers.forEach(marker => {
                const el = document.createElement('div');
                el.className = `damage-marker ${marker.type}`;
                el.style.left = `${marker.x}%`;
                el.style.top = `${marker.y}%`;
                el.title = marker.description;
                el.textContent = marker.type === 'scratch' ? 'N' : marker.type === 'dent' ? 'O' : 'X';
                container.appendChild(el);
            });
            const listEl = document.getElementById('damageList');
            listEl.innerHTML = '';
            markers.forEach(marker => {
                const item = document.createElement('div');
                item.className = 'damage-item';
                item.innerHTML = `
                    <div>
                        <strong>${marker.type.charAt(0).toUpperCase() + marker.type.slice(1)}</strong>
                        <br><small>${marker.description}</small>
                    </div>
                    <button class="remove-damage-btn" data-id="${marker.id}"><i class="fas fa-trash"></i></button>`;
                item.querySelector('.remove-damage-btn').addEventListener('click', () => removeCallback(marker.id));
                listEl.appendChild(item);
            });
        },
        showToast(message, type = 'info') {
            const colors = {
                success: 'linear-gradient(to right, #00b09b, #96c93d)',
                error: 'linear-gradient(to right, #ff5f6d, #ffc371)',
                info: 'linear-gradient(to right, #007bff, #00bfff)',
            };
            Toastify({
                text: message,
                duration: 3000,
                gravity: 'bottom',
                position: 'center',
                style: { background: colors[type] }
            }).showToast();
        },
        showConfirm(message, onConfirm) {
            const modal = document.getElementById('modal');
            document.getElementById('modalTitle').textContent = 'Confirmação';
            document.getElementById('modalBody').textContent = message;
            const footer = document.getElementById('modalFooter');
            footer.innerHTML = `<button id="confirmCancel" class="btn btn-secondary">Cancelar</button><button id="confirmOk" class="btn btn-primary">OK</button>`;
            modal.style.display = 'flex';
            document.getElementById('confirmOk').onclick = () => { onConfirm(); modal.style.display = 'none'; };
            document.getElementById('confirmCancel').onclick = () => modal.style.display = 'none';
        },
        showPrompt(message, callback) {
            const modal = document.getElementById('modal');
            document.getElementById('modalTitle').textContent = 'Informação Necessária';
            document.getElementById('modalBody').innerHTML = `<p>${message}</p><input type="text" id="promptInput" class="form-group" style="width:100%;">`;
            const footer = document.getElementById('modalFooter');
            footer.innerHTML = `<button id="promptCancel" class="btn btn-secondary">Cancelar</button><button id="promptOk" class="btn btn-primary">OK</button>`;
            modal.style.display = 'flex';
            const input = document.getElementById('promptInput');
            input.focus();
            const handleOk = () => { callback(input.value); modal.style.display = 'none'; };
            document.getElementById('promptOk').onclick = handleOk;
            input.onkeydown = (e) => { if(e.key === 'Enter') handleOk(); };
            document.getElementById('promptCancel').onclick = () => { callback(null); modal.style.display = 'none'; };
        },
        showDraftsModal(drafts, onSelect) {
            const modal = document.getElementById('modal');
            document.getElementById('modalTitle').textContent = 'Carregar Rascunho';
            const body = document.getElementById('modalBody');
            body.innerHTML = '<ul class="draft-list"></ul>';
            const list = body.querySelector('.draft-list');
            drafts.forEach(draft => {
                const item = document.createElement('li');
                item.className = 'draft-item';
                const date = new Date(draft.timestamp).toLocaleString('pt-BR');
                item.innerHTML = `
                    <div class="draft-item-info">
                        <span class="placa">${draft.data.placa || 'Sem Placa'}</span>
                        <span class="date">${date}</span>
                    </div>
                    <button class="btn btn-sm btn-primary">Carregar</button>`;
                item.querySelector('button').addEventListener('click', () => { onSelect(draft.key); modal.style.display = 'none'; });
                list.appendChild(item);
            });
            document.getElementById('modalFooter').innerHTML = `<button id="draftsClose" class="btn btn-secondary">Fechar</button>`;
            document.getElementById('draftsClose').onclick = () => modal.style.display = 'none';
            modal.style.display = 'flex';
        }
    };

    const Storage = {
        prefix: 'checklist_',
        save(data) {
            const key = `${this.prefix}${Date.now()}`;
            localStorage.setItem(key, JSON.stringify(data));
        },
        get(key) {
            return JSON.parse(localStorage.getItem(key));
        },
        getAll() {
            return Object.keys(localStorage)
                .filter(key => key.startsWith(this.prefix))
                .map(key => ({
                    key: key,
                    timestamp: parseInt(key.replace(this.prefix, '')),
                    data: this.get(key)
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
        }
    };

    const PDF = {
        generateAndUpload: async function(data) {
            // Verifica se o tipo de checklist foi selecionado
            if (!data.tipoChecklist) {
                UI.showToast("Por favor, selecione um 'Tipo de Checklist' antes de salvar.", 'error');
                return;
            }

            UI.showToast('Gerando PDF, por favor aguarde...', 'info');
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'mm', 'a4');
                const pageWidth = doc.internal.pageSize.getWidth();
                const margin = 15;
                let y = 0;

                const addMasterPageElements = (doc, pageNum, totalPages) => {
                    doc.setFillColor(76, 81, 109);
                    doc.rect(0, 0, pageWidth, 20, 'F');
                    doc.setFontSize(16);
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    doc.text('C.P.M', margin, 12);
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'normal');
                    doc.text('Relatório de Checklist Veicular', pageWidth - margin, 12, { align: 'right' });
                    doc.setFontSize(8);
                    doc.setTextColor(150);
                    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
                };
                
                const addSectionTitle = (startY, title) => {
                    if (startY > 250) { doc.addPage(); return 30; }
                    doc.setFillColor(220, 220, 220);
                    doc.rect(margin, startY, pageWidth - (margin * 2), 8, 'F');
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0);
                    doc.text(title, margin + 2, startY + 6);
                    return startY + 12;
                };

                const addKeyValue = (startY, key, value, xOffset = 0) => {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.text(key, margin + xOffset, startY);
                    doc.setFont('helvetica', 'normal');
                    doc.text(String(value || '---'), margin + 25 + xOffset, startY);
                };

                const addCheckboxGroup = (startX, startY, title, allItems, checkedItems) => {
                    let yPos = startY;
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.text(title, startX, yPos);
                    yPos += 5;
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    allItems.forEach(item => {
                        const isChecked = Array.isArray(checkedItems) && checkedItems.includes(item.value);
                        doc.rect(startX + 2, yPos - 3, 3, 3);
                        if (isChecked) doc.text('X', startX + 2.7, yPos - 0.5);
                        doc.text(item.label, startX + 7, yPos);
                        yPos += 5;
                    });
                    return yPos;
                };

                const addRadioGroup = (startX, startY, title, value) => {
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.text(title, startX, startY);
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.text(value || 'Não preenchido', startX + 2, startY + 5);
                    return startY + 10;
                };
                
                y = 30;
                y = addSectionTitle(y, 'Informações Gerais');
                addKeyValue(y, 'Data:', new Date().toLocaleString('pt-BR'));
                addKeyValue(y, 'Placa:', data.placa, 100);
                y += 6;
                addKeyValue(y, 'Observador:', data.observador);
                addKeyValue(y, 'Modelo:', data.modelo, 100);
                y += 6;
                addKeyValue(y, 'Supervisor:', data.supervisor);
                addKeyValue(y, 'Condutor:', data.condutor, 100);
                y += 6;
                addKeyValue(y, 'KM:', data.km);
                addKeyValue(y, 'Combustível:', data.combustivel, 100);
                y += 10;
                
                y = addSectionTitle(y, 'Itens do Checklist');
                const col1X = margin;
                const col2X = margin + 65;
                const col3X = margin + 130;
                let yCol1, yCol2, yCol3;

                yCol1 = addCheckboxGroup(col1X, y, "Acessórios", [
                    {label: "Bagageiro", value: "bagageiro"}, {label: "Antena", value: "antena"}, {label: "Triângulo", value: "triangulo"}, {label: "Macaco", value: "macaco"}, {label: "Chave de Roda", value: "chave_roda"}, {label: "Extintor", value: "extintor"}, {label: "Tapetes", value: "tapetes"}
                ], data.acessorios);
                yCol2 = addCheckboxGroup(col2X, y, "Irregularidades Elétricas", [
                    {label: "Painel", value: "painel"}, {label: "Buzina", value: "buzina"}, {label: "Luzes Internas", value: "luzes_internas"}, {label: "Farol", value: "farol"}, {label: "Limpador", value: "limpador_parabrisa"}, {label: "Setas", value: "setas"}
                ], data.sistema_eletrico);
                yCol3 = addCheckboxGroup(col3X, y, "Irregularidades de Freios", [
                    {label: "Puxando", value: "puxando"}, {label: "Trepidando", value: "trepidando"}, {label: "Não Segura", value: "nao_segura"}, {label: "Batendo", value: "batendo"}
                ], data.freios);
                y = Math.max(yCol1, yCol2, yCol3) + 5;

                yCol1 = addCheckboxGroup(col1X, y, "Irregularidades de Motor", [
                    {label: "Falha na Partida", value: "falha_partida"}, {label: "Sem Força", value: "sem_forca"}, {label: "Óleo Baixo", value: "oleo_baixo"}, {label: "Vazando", value: "vazando"}, {label: "Aquecendo", value: "aquecendo"}
                ], data.motor);
                yCol2 = addCheckboxGroup(col2X, y, "Irregularidades de Eixo/Susp.", [
                    {label: "Puxando", value: "puxando"}, {label: "Trepidando", value: "trepidando"}, {label: "Batendo", value: "batendo"}, {label: "Com Folga", value: "com_folga"}
                ], data.eixo_suspensao);
                yCol3 = addCheckboxGroup(col3X, y, "Documentação", [
                    {label: "Vencido", value: "vencido"}, {label: "Faltando", value: "faltando"}
                ], data.documentacao);
                y = Math.max(yCol1, yCol2, yCol3) + 5;

                doc.setDrawColor(220, 220, 220);
                doc.line(margin, y, pageWidth - margin, y);
                y += 5;
                addRadioGroup(col1X, y, "Pneus Dianteiros", data.pneus_dianteiros);
                addRadioGroup(col2X, y, "Pneus Traseiros", data.pneus_traseiros);
                addRadioGroup(col3X, y, "Estepe", data.estepe);
                y += 15;

                if (data.vehicleImageBase64) {
                    if (y > 150) { doc.addPage(); y = 30; }
                    y = addSectionTitle(y, 'Inspeção Visual e Avarias');
                    doc.addImage(data.vehicleImageBase64, 'JPEG', margin, y, 180, 100);
                    data.damageMarkers.forEach(marker => {
                        const markerX = margin + (180 * marker.x / 100);
                        const markerY = y + (100 * marker.y / 100);
                        let color = marker.type === 'scratch' ? [255, 193, 7] : marker.type === 'dent' ? [253, 126, 20] : [220, 53, 69];
                        doc.setFillColor(...color);
                        doc.circle(markerX, markerY, 2, 'F');
                    });
                    y += 105;
                    if(data.damageMarkers.length > 0){
                        data.damageMarkers.forEach(d => { doc.text(`- [${d.type.charAt(0).toUpperCase()}] ${d.description}`, margin, y); y += 5; });
                    } else {
                        doc.text('- Nenhuma avaria registrada.', margin, y); y += 5;
                    }
                }

                if (y > 220) { doc.addPage(); y = 30; }
                y = addSectionTitle(y, 'Transferência, Anotações e Assinatura');
                let ySignature = y;
                addKeyValue(y, 'Entregue por:', data.entregue_por);
                y += 6;
                addKeyValue(y, 'Recebido por:', data.recebido_por);
                y += 10;
                doc.setFont('helvetica', 'bold');
                doc.text('Anotações:', margin, y);
                y += 5;
                doc.setFont('helvetica', 'normal');
                const splitNotes = doc.splitTextToSize(data.anotacoes || 'Nenhuma anotação.', (pageWidth - (margin * 2) - 100));
                doc.text(splitNotes, margin, y);

                if (data.signatureBase64) {
                    const signatureY = ySignature > 220 ? 220 : ySignature;
                    doc.addImage(data.signatureBase64, 'PNG', pageWidth - margin - 80, signatureY, 80, 40);
                    doc.setDrawColor(0,0,0);
                    doc.line(pageWidth - margin - 80, signatureY + 42, pageWidth - margin, signatureY + 42);
                    doc.text('Assinatura do Condutor', pageWidth - margin - 40, signatureY + 46, {align: 'center'});
                }

                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    addMasterPageElements(doc, i, totalPages);
                }
                
                UI.showToast('Enviando para o Google Drive...', 'info');
                
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                
                const now = new Date();
                const ano = now.getFullYear().toString();
                const mesNumero = (now.getMonth() + 1).toString().padStart(2, '0');
                const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                const mesNome = meses[now.getMonth()];

                // Capitaliza a primeira letra do tipo de checklist
                const tipoCapitalized = data.tipoChecklist.charAt(0).toUpperCase() + data.tipoChecklist.slice(1);

                const payload = {
                    pdfData: pdfBase64,
                    fileName: `${data.placa || 'Veiculo'}_${tipoCapitalized}_${now.toISOString()}.pdf`,
                    tipoChecklist: tipoCapitalized,
                    ano: ano,
                    mes: `${mesNumero} - ${mesNome}`
                };

                const webAppUrl = "https://script.google.com/macros/s/AKfycbz8zjoPo9Ytk1MaLx2bzwsrEoaeViL3qp_lcrnWN_6kD6DudrAt_wT6Mwhr6I9u3myM/exec"; 
                
                const response = await fetch(webAppUrl, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.status === "success") {
                    UI.showToast('Checklist salvo no Google Drive com sucesso!', 'success');
                } else {
                    throw new Error(result.message);
                }

            } catch (error) {
                console.error('Erro ao gerar ou salvar PDF:', error);
                UI.showToast(`Erro: ${error.message}`, 'error');
            }
        },
    };
    
    App.init();
});
