   // ============= GLOBAL VARIABLES =============
let cart = [];
let isTransitioning = false;

// Performance optimization: Cache DOM elements
const elements = {
  body: document.body,
  html: document.documentElement,
  header: document.querySelector('.header'),
  progressBar: document.getElementById('progressBar'),
  cartIcon: document.getElementById('cartIcon'),
  cartCount: document.getElementById('cartCount'),
  cartDrawer: document.getElementById('cartDrawer'),
  cartOverlay: document.getElementById('cartOverlay'),
  closeCart: document.getElementById('closeCart'),
  cartItems: document.getElementById('cartItems'),
  cartFooter: document.getElementById('cartFooter'),
  cartTotalItems: document.getElementById('cartTotalItems'),
  cartEstimatedTotal: document.getElementById('cartEstimatedTotal'),
  hamburger: document.querySelector('.hamburger'),
  mobileNav: document.getElementById('mobileNav'),
  menuOverlay: document.getElementById('menuOverlay'),
  mobileNavClose: document.querySelector('.mobile-nav-close'),
  searchBtn: document.querySelector('.search-btn'),
  searchOverlay: document.getElementById('searchOverlay'),
  searchClose: document.querySelector('.search-close'),
  modal: document.getElementById('quickViewModal'),
  closeModal: document.querySelector('.close-modal'),
  slider: document.querySelector('.slider'),
  slides: document.querySelectorAll('.slide'),
  prevBtn: document.querySelector('.prev-btn'),
  nextBtn: document.querySelector('.next-btn'),
  dotsContainer: document.querySelector('.slider-dots'),
  messageForm: document.getElementById('messageForm'),
  formSuccess: document.querySelector('.form-success')
};

// ============= SITE SETTINGS (edit per client) =============
const SITE = {
  name: { en: 'Rice & Foodstuff Trading', ar: 'تجارة الأرز والمواد الغذائية' },
  whatsapp: '15550100199',          // international format, digits only; also used in the static wa.me links in both pages
  email: 'sales@example.com',
  currency: 'USD'
};

// ============= LANGUAGE =============
// One script serves index.html (en, LTR) and ar/index.html (ar, RTL); the page's <html lang> picks the strings.
const LANG = document.documentElement.lang === 'ar' ? 'ar' : 'en';
// Images are addressed from this script's folder, so they resolve from either page.
const ASSETS = new URL('.', document.currentScript.src).href;
const T = {
  en: {
    added: 'Added to cart', cleared: 'Cart cleared', confirmClear: 'Are you sure you want to clear your cart?',
    emptyTitle: 'Your cart is empty', emptyText: 'Add some delicious rice to your cart', continueShopping: 'Continue Shopping',
    remove: 'Remove', decrease: 'Decrease quantity', increase: 'Increase quantity', quantity: 'Quantity',
    orderNow: 'Order Now', imageFailed: 'Image failed to load', searching: 'Searching for: ',
    interested: (name, qty) => `I'm interested in ${name} - Quantity: ${qty}`,
    orderIntro: 'Hello, I would like to order the following products:', orderLine: (name, qty) => `${name} - Quantity: ${qty}`,
    orderOutro: 'Please confirm the order and provide payment and shipping details.',
    mailSubject: (site) => `New message from the ${site} website`,
    mailBody: (f) => `Name: ${f.name}\nEmail: ${f.email || 'Not provided'}\nPhone: ${f.phone}\n\nMessage:\n${f.message}`
  },
  ar: {
    added: 'تمت الإضافة إلى السلة', cleared: 'تم إفراغ السلة', confirmClear: 'هل تريد إفراغ السلة؟',
    emptyTitle: 'سلتك فارغة', emptyText: 'أضف بعض الأرز الشهي إلى سلتك', continueShopping: 'متابعة التسوق',
    remove: 'إزالة', decrease: 'إنقاص الكمية', increase: 'زيادة الكمية', quantity: 'الكمية',
    orderNow: 'اطلب الآن', imageFailed: 'تعذّر تحميل الصورة', searching: 'جارٍ البحث عن: ',
    interested: (name, qty) => `أرغب في طلب ${name} - الكمية: ${qty}`,
    orderIntro: 'مرحبًا، أرغب في طلب المنتجات التالية:', orderLine: (name, qty) => `${name} - الكمية: ${qty}`,
    orderOutro: 'يرجى تأكيد الطلب وإرسال تفاصيل الدفع والشحن.',
    mailSubject: (site) => `رسالة جديدة من موقع ${site}`,
    mailBody: (f) => `الاسم: ${f.name}\nالبريد الإلكتروني: ${f.email || 'غير مذكور'}\nالهاتف: ${f.phone}\n\nالرسالة:\n${f.message}`
  }
}[LANG];
// Latin digits in both languages, so prices read the same on the invoice and in WhatsApp.
const money = (n) => new Intl.NumberFormat(LANG === 'ar' ? 'ar-u-nu-latn' : 'en-US', { style: 'currency', currency: SITE.currency }).format(n);

// Product Data: titles and descriptions in both languages
const productsData = {
  1: {
    title: { en: 'XXXL 1121 Basmati Rice (35kg)', ar: 'أرز بسمتي 1121 XXXL (35 كجم)' },
    description: {
      en: 'Premium Long Grain Basmati Rice. Direct from partner farms with rigorous quality checks. Suitable for diabetics, cholesterol free, and aged for perfect texture.',
      ar: 'أرز بسمتي فاخر طويل الحبة، مباشرة من مزارع شريكة مع فحوصات جودة دقيقة. مناسب لمرضى السكري، خالٍ من الكوليسترول، ومعتّق لقوام مثالي.'
    },
    image: 'img/product-1.jpg', price: 66.00
  },
  2: {
    title: { en: 'XXXL 1121 Basmati Rice (5kg)', ar: 'أرز بسمتي 1121 XXXL (5 كجم)' },
    description: {
      en: 'Aged long-grain rice with aromatic flavor and fluffy texture. Ideal for daily cooking and special occasions. Perfect for biryani, pilaf and everyday rice dishes.',
      ar: 'أرز معتّق طويل الحبة بنكهة عطرية وقوام هش. مثالي للطبخ اليومي والمناسبات، وللبرياني والبيلاف وأطباق الأرز اليومية.'
    },
    image: 'img/product-2.jpg', price: 11.50
  },
  3: {
    title: { en: 'Classic XXL Biryani Rice (35kg)', ar: 'أرز البرياني الكلاسيكي XXL (35 كجم)' },
    description: {
      en: 'Aromatic XXL grains perfect for traditional biryani dishes. Premium long-grain rice with rich flavor and perfect texture that stays separate when cooked.',
      ar: 'حبات XXL عطرية مثالية لأطباق البرياني التقليدية. أرز فاخر طويل الحبة بنكهة غنية وقوام مثالي تبقى حباته منفصلة بعد الطهي.'
    },
    image: 'img/product-3.jpg', price: 57.00
  },
  4: {
    title: { en: '1121 XXXL Golden Sella Basmati Rice (20kg)', ar: 'أرز بسمتي سيلا ذهبي 1121 XXXL (20 كجم)' },
    description: {
      en: 'Parboiled golden grains that are naturally aromatic. Perfect texture for biryani, mandi, and traditional rice dishes. Retains nutrients through special processing.',
      ar: 'حبات ذهبية مسلوقة جزئيًا بعطر طبيعي. قوام مثالي للبرياني والمندي وأطباق الأرز التقليدية، وتحتفظ بعناصرها الغذائية بفضل معالجة خاصة.'
    },
    image: 'img/product-4.jpg', price: 39.00
  },
  5: {
    title: { en: 'Palakkadan Matta Rice (18kg)', ar: 'أرز ماتا بالاكادان (18 كجم)' },
    description: {
      en: 'Traditional Kerala rice known for its unique taste and texture. Rich in fiber and nutrients, making it ideal for healthy meals. Perfect for traditional South Indian dishes like Kanji and Pongal.',
      ar: 'أرز تقليدي من كيرالا معروف بمذاقه وقوامه المميزين. غني بالألياف والعناصر الغذائية ومثالي للوجبات الصحية وأطباق جنوب الهند التقليدية مثل الكانجي والبونجال.'
    },
    image: 'img/product-5.jpg', price: 31.00
  },
  6: {
    title: { en: 'Sona Masoori Rice (18kg)', ar: 'أرز سونا مسوري (18 كجم)' },
    description: {
      en: 'Premium quality Sona Masoori rice sourced from South India. Known for its light, fluffy texture and excellent cooking results. Perfect for daily meals and traditional South Indian dishes like idli, dosa, and pongal.',
      ar: 'أرز سونا مسوري عالي الجودة من جنوب الهند، معروف بقوامه الخفيف الهش ونتائج طهيه الممتازة. مثالي للوجبات اليومية وأطباق جنوب الهند التقليدية مثل الإدلي والدوسا والبونجال.'
    },
    image: 'img/product-6.jpg', price: 27.00
  }
};
// Resolve each product to the page's language once, so the rest of the script reads plain strings.
for (const p of Object.values(productsData)) {
  p.title = p.title[LANG];
  p.description = p.description[LANG];
  p.image = ASSETS + p.image;
}

// ============= UTILITY FUNCTIONS =============

/**
 * Generate WhatsApp link with proper parameters
 * @param {string} productName - The name of product
 * @param {number} quantity - The quantity of product
 * @returns {string} The formatted WhatsApp link
 */
function generateWhatsAppLink(productName, quantity) {
  const message = T.interested(productName, quantity);
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
}

/**
 * Validate email format
 * @param {string} email - The email to validate
 * @returns {boolean} True if email is valid, false otherwise
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - The function to debounce
 * @param {number} wait - The time to wait in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(func, wait) {
  let timer = null; // one timer per debounced function
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Smooth scroll function with fallback for older browsers
 * @param {HTMLElement|string} target - The target element or selector
 * @param {number} [offset=100] - The offset from top (Increased for better clearance)
 */
function smoothScroll(target, offset = 100) {
  if (!target) return;
  
  // If target is a string, get element
  if (typeof target === 'string') {
    target = document.querySelector(target);
  }
  
  if (!target) return;
  
  const targetPosition = target.offsetTop - offset;
  
  if ('scrollBehavior' in document.documentElement.style) {
    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth'
    });
  } else {
    // Fallback for older browsers
    window.scrollTo(0, targetPosition);
  }
}

/**
 * Show a notification message
 * @param {string} message - The message to show
 * @param {number} [duration=3000] - The duration in milliseconds
 */
function showNotification(message, duration = 3000) {
  // Remove existing notification if any
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--primary);
    color: white;
    padding: 12px 24px;
    border-radius: 50px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1003;
    animation: slideUp 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  // Remove notification after specified duration
  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, duration);
}

/**
 * Handle image error with fallback
 * @param {HTMLImageElement} img - The image element
 */
function handleImageError(img) {
  if (!img.dataset.errorHandled) {
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NjY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIE5vdCBGb3VuZDwvdGV4dD48L3N2Zz4=';
    img.alt = T.imageFailed;
    img.dataset.errorHandled = 'true';
  }
}

// ============= SHOPPING CART FUNCTIONS =============

/**
 * Add item to cart
 * @param {number|string} productId - The ID of product
 * @param {number} quantity - The quantity to add
 */
function addToCart(productId, quantity) {
  if (!productId || !quantity) return;
  
  const product = productsData[productId];
  if (!product) return;
  
  // Check if product already exists in cart
  const existingItemIndex = cart.findIndex(item => item.id === productId);
  
  if (existingItemIndex !== -1) {
    // Update quantity if product already in cart
    cart[existingItemIndex].quantity += quantity;
  } else {
    // Add new item to cart
    cart.push({
      id: productId,
      title: product.title,
      image: product.image,
      price: product.price || 0,
      quantity: quantity
    });
  }
  
  // Update cart UI
  updateCartUI();
  
  // Add pulse animation to cart icon
  if (elements.cartIcon) {
    elements.cartIcon.classList.add('pulse');
    setTimeout(() => {
      elements.cartIcon.classList.remove('pulse');
    }, 1500);
  }
  
  // Show notification
  showNotification(T.added);
}

/**
 * Remove item from cart
 * @param {number|string} productId - The ID of product to remove
 */
function removeFromCart(productId) {
  if (!productId) return;
  
  cart = cart.filter(item => item.id !== productId);
  updateCartUI();
}

/**
 * Update item quantity in cart
 * @param {number|string} productId - The ID of product
 * @param {number} quantity - The new quantity
 */
function updateCartItemQuantity(productId, quantity) {
  if (!productId || quantity === undefined) return;
  
  const item = cart.find(item => item.id === productId);
  if (item) {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      item.quantity = quantity;
      updateCartUI();
    }
  }
}

/**
 * Clear entire cart
 */
function clearCart() {
  cart = [];
  updateCartUI();
  showNotification(T.cleared);
}

/**
 * Update cart UI
 */
function updateCartUI() {
  const cartCount = elements.cartCount;
  const cartItems = elements.cartItems;
  const cartFooter = elements.cartFooter;
  const cartTotalItems = elements.cartTotalItems;
  const cartEstimatedTotal = elements.cartEstimatedTotal;
  
  // Update cart count
  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalItems;
  
  // Update cart items display
  if (cart.length === 0) {
    if (cartItems) {
      cartItems.innerHTML = `
        <div class="cart-empty">
          <div class="empty-cart-icon">
            <i class="fas fa-shopping-basket"></i>
          </div>
          <h4>${T.emptyTitle}</h4>
          <p>${T.emptyText}</p>
          <button class="continue-shopping-btn" id="continueShopping">
            <span>${T.continueShopping}</span>
          </button>
        </div>
      `;
      
      // Add event listener to continue shopping button
      const continueShoppingBtn = document.getElementById('continueShopping');
      if (continueShoppingBtn) {
        continueShoppingBtn.addEventListener('click', function() {
          if (elements.cartDrawer) elements.cartDrawer.classList.remove('active');
          if (elements.cartOverlay) elements.cartOverlay.classList.remove('active');
        });
      }
    }
    if (cartFooter) cartFooter.style.display = 'none';
  } else {
    if (cartItems) {
      // Clear cart items
      cartItems.innerHTML = '';
      
      // Add each item to cart
      cart.forEach((item, index) => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.style.animationDelay = `${index * 0.1}s`;
        cartItem.innerHTML = `
          <img src="${item.image}" alt="${item.title}" class="cart-item-image" width="80" height="80">
          <div class="cart-item-details">
            <div class="cart-item-title">${item.title}</div>
            <div class="cart-item-price">${money(item.price * item.quantity)}</div>
            <div class="cart-item-quantity">
              <button class="quantity-btn minus" data-product-id="${item.id}" data-action="decrease" aria-label="${T.decrease}">-</button>
              <input type="number" value="${item.quantity}" min="1" class="cart-quantity-input" data-product-id="${item.id}" aria-label="${T.quantity}">
              <button class="quantity-btn plus" data-product-id="${item.id}" data-action="increase" aria-label="${T.increase}">+</button>
            </div>
            <button class="cart-item-remove" data-product-id="${item.id}">
              <i class="fas fa-trash-alt"></i>
              <span>${T.remove}</span>
            </button>
          </div>
        `;
        cartItems.appendChild(cartItem);
      });
      
      // Add event listeners to cart item buttons
      document.querySelectorAll('.cart-item-quantity .quantity-btn').forEach(button => {
        button.addEventListener('click', function() {
          const productId = parseInt(this.getAttribute('data-product-id'));
          const action = this.getAttribute('data-action');
          const input = this.parentElement.querySelector('.cart-quantity-input');
          const currentValue = parseInt(input.value) || 1;
          
          if (action === 'decrease') {
            updateCartItemQuantity(productId, currentValue - 1);
          } else if (action === 'increase') {
            updateCartItemQuantity(productId, currentValue + 1);
          }
        });
      });
      
      document.querySelectorAll('.cart-quantity-input').forEach(input => {
        input.addEventListener('change', function() {
          const productId = parseInt(this.getAttribute('data-product-id'));
          const value = parseInt(this.value) || 1;
          updateCartItemQuantity(productId, value);
        });
      });
      
      document.querySelectorAll('.cart-item-remove').forEach(button => {
        button.addEventListener('click', function() {
          const productId = parseInt(this.getAttribute('data-product-id'));
          removeFromCart(productId);
        });
      });
    }
    
    if (cartFooter) cartFooter.style.display = 'block';
    
    // Update total items
    if (cartTotalItems) cartTotalItems.textContent = totalItems;
    
    // Update estimated total
    const estimatedTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    if (cartEstimatedTotal) cartEstimatedTotal.textContent = money(estimatedTotal);
  }
}

/**
 * Generate cart checkout message
 * @returns {string} The formatted message for WhatsApp
 */
function generateCartCheckoutMessage() {
  if (cart.length === 0) return '';
  
  const lines = cart.map(item => T.orderLine(item.title, item.quantity));
  const message = [T.orderIntro, '', ...lines, '', T.orderOutro].join('\n');
  
  return message;
}

// ============= SCROLL EVENTS =============

/**
 * Update progress bar based on scroll position
 */
function updateProgressBar() {
  const winScroll = elements.body.scrollTop || elements.html.scrollTop;
  const height = elements.html.scrollHeight - elements.html.clientHeight;
  const scrolled = (winScroll / height) * 100;
  
  if (elements.progressBar) {
    elements.progressBar.style.width = scrolled + '%';
  }
}

/**
 * Update header style based on scroll position
 */
function updateHeaderStyle() {
  if (elements.header) {
    if (window.scrollY > 50) {
      elements.header.classList.add('scrolled');
    } else {
      elements.header.classList.remove('scrolled');
    }
  }
}

/**
 * Update active navigation link based on scroll position
 */
function updateActiveNavLink() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  
  let current = '';
  
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    if (window.scrollY >= (sectionTop - 150)) {
      current = section.getAttribute('id');
    }
  });
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
}

// Debounced scroll handler
const handleScroll = debounce(() => {
  updateProgressBar();
  updateHeaderStyle();
  updateActiveNavLink();
}, 10);

// ============= MOBILE MENU =============

/**
 * Toggle mobile menu
 */
function toggleMobileMenu() {
  if (elements.hamburger && elements.mobileNav && elements.menuOverlay) {
    elements.hamburger.classList.toggle('active');
    elements.mobileNav.classList.toggle('active');
    elements.menuOverlay.classList.toggle('active');
    
    if (elements.mobileNav.classList.contains('active')) {
      elements.body.style.overflow = 'hidden';
    } else {
      elements.body.style.overflow = 'auto';
    }
  }
}

/**
 * Close mobile menu
 */
function closeMobileMenu() {
  if (elements.hamburger && elements.mobileNav && elements.menuOverlay) {
    elements.hamburger.classList.remove('active');
    elements.mobileNav.classList.remove('active');
    elements.menuOverlay.classList.remove('active');
    elements.body.style.overflow = 'auto';
  }
}

// ============= SEARCH OVERLAY =============

/**
 * Open search overlay
 */
function openSearchOverlay() {
  if (elements.searchOverlay) {
    elements.searchOverlay.classList.add('active');
    elements.body.style.overflow = 'hidden';
    
    // Focus on search input
    setTimeout(() => {
      const searchInput = elements.searchOverlay.querySelector('input');
      if (searchInput) searchInput.focus();
    }, 300);
  }
}

/**
 * Close search overlay
 */
function closeSearchOverlay() {
  if (elements.searchOverlay) {
    elements.searchOverlay.classList.remove('active');
    elements.body.style.overflow = 'auto';
  }
}

/**
 * Handle search form submission
 * @param {Event} e - The form submission event
 */
function handleSearchSubmit(e) {
  e.preventDefault();
  const searchInput = e.target.querySelector('input');
  const searchTerm = searchInput.value.trim();
  
  if (searchTerm) {
    // In a real implementation, this would perform a search
    alert(T.searching + searchTerm);
    closeSearchOverlay();
    searchInput.value = '';
  }
}

// ============= PRODUCT CATEGORIES =============

/**
 * Filter products by category
 * @param {string} category - The category to filter by
 */
function filterProducts(category) {
  const productCards = document.querySelectorAll('.product-card');
  
  productCards.forEach((card, index) => {
    if (category === 'all' || card.getAttribute('data-category') === category) {
      card.style.display = 'flex';
      // Add animation delay for staggered effect
      card.style.animation = `productFadeIn 0.6s ease ${index * 0.1}s both`;
    } else {
      card.style.display = 'none';
    }
  });
}

// ============= IMAGE SLIDER =============
let currentSlide = 0;
const slideCount = elements.slides ? elements.slides.length : 0;
let slideInterval;

/**
 * Create slider dots
 */
function createDots() {
  if (!elements.dotsContainer || !elements.slides) return;
  
  elements.dotsContainer.innerHTML = '';
  elements.slides.forEach((_, index) => {
    const dot = document.createElement('span');
    dot.classList.add('slider-dot');
    if (index === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goToSlide(index));
    elements.dotsContainer.appendChild(dot);
  });
}

/**
 * Go to specific slide
 * @param {number} slideIndex - The index of slide to go to
 */
function goToSlide(slideIndex) {
  if (isTransitioning || !elements.slider) return;
  
  isTransitioning = true;
  currentSlide = (slideIndex + slideCount) % slideCount;
  
  const transformValue = `translateX(-${currentSlide * 100}%)`;
  
  elements.slider.style.transform = transformValue;
  updateDots();
  
  setTimeout(() => {
    isTransitioning = false;
  }, 500);
}

/**
 * Update active dot
 */
function updateDots() {
  const dots = document.querySelectorAll('.slider-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === currentSlide);
  });
}

/**
 * Go to next slide
 */
function nextSlide() {
  goToSlide(currentSlide + 1);
}

/**
 * Go to previous slide
 */
function prevSlide() {
  goToSlide(currentSlide - 1);
}

/**
 * Reset slide interval
 */
function resetInterval() {
  clearInterval(slideInterval);
  slideInterval = setInterval(nextSlide, 5000);
}

/**
 * Initialize slider
 */
function initSlider() {
  if (!elements.slider || slideCount === 0) return;
  
  createDots();
  resetInterval();
  
  // Button events
  if (elements.nextBtn) elements.nextBtn.addEventListener('click', nextSlide);
  if (elements.prevBtn) elements.prevBtn.addEventListener('click', prevSlide);
  
  // Pause on hover
  const sliderContainer = document.querySelector('.slider-container');
  if (sliderContainer) {
    sliderContainer.addEventListener('mouseenter', () => {
      clearInterval(slideInterval);
    });
    
    sliderContainer.addEventListener('mouseleave', resetInterval);
    
    // Touch events
    let touchStartX = 0;
    let touchEndX = 0;
    
    sliderContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      clearInterval(slideInterval);
    }, {passive: true});
    
    sliderContainer.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
      resetInterval();
    }, {passive: true});
    
    function handleSwipe() {
      const threshold = 50;
      if (touchEndX < touchStartX - threshold) {
        nextSlide();
      } else if (touchEndX > touchStartX + threshold) {
        prevSlide();
      }
    }
  }
}

// ============= PRODUCT QUICK VIEW =============
let currentProductTitle = '';

/**
 * Update modal order link when quantity changes
 */
function updateModalOrderLink() {
  const qtyInput = document.querySelector('#quickViewModal .quantity-input');
  if (!qtyInput) return;
  
  const qty = parseInt(qtyInput.value) || 1;
  const href = generateWhatsAppLink(currentProductTitle, qty);
  
  const modalOrderBtn = document.getElementById('modalOrderBtn');
  if (modalOrderBtn) {
    modalOrderBtn.setAttribute('href', href);
  }
}

/**
 * Open product quick view modal
 * @param {number|string} productId - The ID of product
 */
function openQuickViewModal(productId) {
  const product = productsData[productId];
  
  if (!product) return;
  
  currentProductTitle = product.title;
  
  // Update modal content
  const modalProductTitle = document.getElementById('modalProductTitle');
  const modalProductDescription = document.getElementById('modalProductDescription');
  const modalImage = document.getElementById('modalProductImage');
  
  if (modalProductTitle) modalProductTitle.textContent = currentProductTitle;
  if (modalProductDescription) modalProductDescription.textContent = product.description;
  
  if (modalImage) {
    modalImage.src = product.image;
    modalImage.alt = currentProductTitle;
    
    // Handle image error
    modalImage.onerror = function() {
      handleImageError(this);
    };
  }
  
  // Reset quantity
  const qtyInput = document.querySelector('#quickViewModal .quantity-input');
  if (qtyInput) qtyInput.value = 1;
  
  // Set modal order button text
  const modalOrderBtn = document.getElementById('modalOrderBtn');
  if (modalOrderBtn) {
    modalOrderBtn.textContent = T.orderNow;
  }
  
  // Set WhatsApp link
  const quantity = parseInt(qtyInput.value) || 1;
  const whatsappLink = generateWhatsAppLink(currentProductTitle, quantity);
  modalOrderBtn.setAttribute('href', whatsappLink);
  modalOrderBtn.setAttribute('target', '_blank');
  
  // Show modal
  if (elements.modal) {
    elements.modal.style.display = 'block';
    elements.body.style.overflow = 'hidden';
  }
}

/**
 * Close quick view modal
 */
function closeQuickViewModal() {
  if (elements.modal) {
    elements.modal.style.display = 'none';
    elements.body.style.overflow = 'auto';
  }
}

// ============= CONTACT FORM =============

/**
 * Validate contact form
 * @param {HTMLFormElement} form - The form to validate
 * @returns {boolean} True if form is valid, false otherwise
 */
function validateContactForm(form) {
  // Reset form errors
  form.querySelectorAll('.form-group').forEach(group => {
    group.classList.remove('error');
  });
  
  if (elements.formSuccess) elements.formSuccess.style.display = 'none';
  
  // Validate form
  let isValid = true;
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const message = document.getElementById('message').value.trim();
  const email = document.getElementById('email').value.trim();
  
  if (!name) { 
    document.getElementById('name').parentElement.classList.add('error'); 
    isValid = false; 
  }
  
  if (!phone) { 
    document.getElementById('phone').parentElement.classList.add('error'); 
    isValid = false; 
  }
  
  if (!message) { 
    document.getElementById('message').parentElement.classList.add('error'); 
    isValid = false; 
  }
  
  // Email validation (optional)
  if (email && !isValidEmail(email)) {
    document.getElementById('email').parentElement.classList.add('error');
    isValid = false;
  }
  
  return isValid;
}

/**
 * Handle contact form submission
 * @param {Event} e - The form submission event
 */
function handleContactFormSubmit(e) {
  e.preventDefault();
  
  const form = e.target;
  
  if (!validateContactForm(form)) return;
  
  // Create email content
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const message = document.getElementById('message').value.trim();
  const email = document.getElementById('email').value.trim();
  
  const emailSubject = T.mailSubject(SITE.name[LANG]);
  const emailBody = T.mailBody({ name, email, phone, message });
  
  // Create mailto link
  const mailtoLink = `mailto:${SITE.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  
  // Show success message
  if (elements.formSuccess) {
    elements.formSuccess.style.display = 'block';
    elements.formSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  // Reset form
  form.reset();
  
  // Open email client after a short delay
  setTimeout(() => {
    window.location.href = mailtoLink;
  }, 1000);
}

// ============= EVENT LISTENERS =============

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Scroll events
  window.addEventListener('scroll', handleScroll);
  
  // Mobile menu events
  if (elements.hamburger) {
    elements.hamburger.addEventListener('click', toggleMobileMenu);
  }
  
  if (elements.menuOverlay) {
    elements.menuOverlay.addEventListener('click', closeMobileMenu);
  }
  
  if (elements.mobileNavClose) {
    elements.mobileNavClose.addEventListener('click', closeMobileMenu);
  }
  
  // Search overlay events
  if (elements.searchBtn) {
    elements.searchBtn.addEventListener('click', openSearchOverlay);
  }
  
  if (elements.searchClose) {
    elements.searchClose.addEventListener('click', closeSearchOverlay);
  }
  
  if (elements.searchOverlay) {
    elements.searchOverlay.addEventListener('click', function(e) {
      if (e.target === elements.searchOverlay) {
        closeSearchOverlay();
      }
    });
  }
  
  // Search form submission
  const searchForm = document.querySelector('.search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', handleSearchSubmit);
  }
  
  // Cart events
  if (elements.cartIcon && elements.cartDrawer && elements.cartOverlay) {
    const openCart = function() {
      elements.cartDrawer.classList.add('active');
      elements.cartOverlay.classList.add('active');
      elements.body.style.overflow = 'hidden';
    };
    elements.cartIcon.addEventListener('click', openCart);
    elements.cartIcon.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCart(); }
    });
  }
  
  if (elements.closeCart && elements.cartDrawer && elements.cartOverlay) {
    elements.closeCart.addEventListener('click', function() {
      elements.cartDrawer.classList.remove('active');
      elements.cartOverlay.classList.remove('active');
      elements.body.style.overflow = 'auto';
    });
  }
  
  if (elements.cartOverlay && elements.cartDrawer) {
    elements.cartOverlay.addEventListener('click', function() {
      elements.cartDrawer.classList.remove('active');
      elements.cartOverlay.classList.remove('active');
      elements.body.style.overflow = 'auto';
    });
  }
  
  // Clear cart button
  const clearCartBtn = document.getElementById('clearCart');
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', function() {
      if (confirm(T.confirmClear)) {
        clearCart();
      }
    });
  }
  
  // Cart checkout
  const cartCheckout = document.getElementById('cartCheckout');
  if (cartCheckout) {
    cartCheckout.addEventListener('click', function() {
      const message = generateCartCheckoutMessage();
      const whatsappLink = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
      window.open(whatsappLink, '_blank');
    });
  }
  
  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      
      // Check if target is "#", "#top", or an actual ID
      if (targetId === '#' || targetId === '#top') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // FIX: Close mobile menu if this link was inside it
        if (this.closest('.mobile-nav-menu')) {
          closeMobileMenu();
        }
        return;
      }

      const target = document.querySelector(targetId);
      
      if (target) {
        e.preventDefault(); // Only prevent default if target exists
        
        // FIX: Close mobile menu if this link is inside it
        if (this.closest('.mobile-nav-menu')) {
          closeMobileMenu();
        }
        
        smoothScroll(target, 100); // Use offset
        
        // Update URL hash without jumping
        if (history.pushState) {
          history.pushState(null, null, targetId);
        } else {
          location.hash = targetId;
        }
      }
    });
  });
  
  // Product categories
  const categoryTabs = document.querySelectorAll('.category-tab');
  categoryTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // Update active tab
      categoryTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // Filter products
      const category = this.getAttribute('data-category');
      filterProducts(category);
    });
  });
  
  // Add to cart buttons
  const addToCartButtons = document.querySelectorAll('.add-to-cart-btn');
  addToCartButtons.forEach(button => {
    button.addEventListener('click', function() {
      const productId = this.getAttribute('data-product-id');
      const productCard = this.closest('.product-card');
      const quantityInput = productCard.querySelector('.quantity-input');
      const quantity = parseInt(quantityInput.value) || 1;
      
      addToCart(productId, quantity);
    });
  });
  
  // Quantity selectors (event delegation)
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.quantity-btn');
    if (!btn) return;
    
    const input = btn.parentElement.querySelector('.quantity-input');
    if (!input) return;
    
    let value = parseInt(input.value) || 1;
    const min = parseInt(input.min) || 1;
    const max = parseInt(input.max) || 10;
    
    if (btn.classList.contains('minus')) {
      value = Math.max(min, value - 1);
    }
    
    if (btn.classList.contains('plus')) {
      value = Math.min(max, value + 1);
    }
    
    input.value = value;
    
    // Trigger input event to update WhatsApp links
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  
  // Validate manual input
  document.addEventListener('input', function (e) {
    const input = e.target.closest('.quantity-input');
    if (!input) return;
    
    let value = parseInt(input.value) || 1;
    const min = parseInt(input.min) || 1;
    const max = parseInt(input.max) || 10;
    
    input.value = Math.min(max, Math.max(min, value));
  });
  
  // Favorite buttons
  document.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      this.classList.toggle('active');
      this.innerHTML = this.classList.contains('active') ? 
        '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
    });
  });
  
  // Quick view buttons
  const quickViewBtns = document.querySelectorAll('.quick-view-btn');
  quickViewBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const productId = this.getAttribute('data-product');
      openQuickViewModal(productId);
    });
  });
  
  // Update WhatsApp link when quantity changes in modal
  const modal = document.getElementById('quickViewModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target.closest('.quantity-btn')) updateModalOrderLink();
    });
    
    modal.addEventListener('input', function(e) {
      if (e.target.classList.contains('quantity-input')) updateModalOrderLink();
    });
  }
  
  // Modal close events
  if (elements.closeModal && elements.modal) {
    elements.closeModal.addEventListener('click', closeQuickViewModal);
  }
  
  window.addEventListener('click', function(e) {
    if (e.target === elements.modal) {
      closeQuickViewModal();
    }
  });
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && elements.modal && elements.modal.style.display === 'block') {
      closeQuickViewModal();
    }
  });
  
  // Product order buttons
  document.querySelectorAll('.product-actions .order-btn:not(.quick-view-btn)').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const productCard = this.closest('.product-card');
      const productName = productCard.querySelector('h3').textContent;
      const quantity = productCard.querySelector('.quantity-input').value;
      const whatsappLink = generateWhatsAppLink(productName, quantity);
      window.open(whatsappLink, '_blank');
    });
  });
  
  // Contact form
  if (elements.messageForm) {
    elements.messageForm.addEventListener('submit', handleContactFormSubmit);
  }
  
  // Image error handling
  document.querySelectorAll('img').forEach(img => {
    // Check if image has already failed
    if (img.complete && img.naturalHeight === 0) {
      handleImageError(img);
      return;
    }
    
    img.addEventListener('error', function() {
      handleImageError(this);
    });
  });
  
  // Skip to content link
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', function(e) {
      e.preventDefault();
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.focus();
        mainContent.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

// ============= INITIALIZATION =============

/**
 * Initialize application
 */
function initApp() {
  // Set current year in footer
  const currentYearElement = document.getElementById('currentYear');
  if (currentYearElement) currentYearElement.textContent = new Date().getFullYear();
  
  // Initialize cart UI
  updateCartUI();
  
  // Initialize active nav link on page load
  updateActiveNavLink();
  
  // Initialize slider
  initSlider();
  
  // Initialize event listeners
  initEventListeners();
  
  // Initialize product animations
  const productCards = document.querySelectorAll('.product-card');
  productCards.forEach((card, index) => {
    card.style.animation = `productFadeIn 0.6s ease ${index * 0.1}s both`;
  });
  
  // Initialize load animations
  document.querySelectorAll('.load-animate').forEach((element, index) => {
    element.style.animation = `fadeInUp 0.8s ease ${index * 0.1}s both`;
  });
  
  // Initialize slide-up animations
  document.querySelectorAll('.slide-up').forEach((element, index) => {
    element.style.animation = `slideUp 0.8s ease ${index * 0.1}s both`;
  });
}

// ============= DOCUMENT READY =============
document.addEventListener('DOMContentLoaded', initApp);

// Make cart functions globally available for inline onclick handlers
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromCart = removeFromCart;

// Add keyboard navigation support
document.addEventListener('keydown', function(e) {
  // Escape key to close modals and overlays
  if (e.key === 'Escape') {
    if (elements.modal && elements.modal.style.display === 'block') {
      closeQuickViewModal();
    }
    
    if (elements.searchOverlay && elements.searchOverlay.classList.contains('active')) {
      closeSearchOverlay();
    }
    
    if (elements.cartDrawer && elements.cartDrawer.classList.contains('active')) {
      elements.cartDrawer.classList.remove('active');
      elements.cartOverlay.classList.remove('active');
      elements.body.style.overflow = 'auto';
    }
    
    if (elements.mobileNav && elements.mobileNav.classList.contains('active')) {
      closeMobileMenu();
    }
  }
  
  // Tab key navigation for accessibility
  if (e.key === 'Tab') {
    // Add any specific tab navigation logic here
  }
});
